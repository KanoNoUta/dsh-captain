import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import { createUserMessage, type ContentBlock, type GenerateOptions, type LlmResolvedModelInfo, type Message, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import type { StreamChunk } from '@deepseek-ai/dsh-llm'
import type { CaptainCheckpoint, CaptainConfig, CaptainPlan, CaptainRoleRoute, CaptainTask, CaptainTextResult, CaptainWorkerResult } from './types.ts'
import { compatibleReasoningEffort, resolvedRoleRoutes } from './presets.ts'
import { advanceCheckpoint, incrementalDiff, type GitReader } from './diff.ts'
import { parseReview, repairTasks, reviewPrompt } from './reviewer.ts'
import { createSchedulerState, finishTask, isSettled, readyTasks, settleBlockedTasks, startTask, validateTasks } from './scheduler.ts'
import { visionRequest, type CaptainImageInput } from './vision.ts'

/** LLM call facade kept small so the orchestrator is deterministic in tests. */
export interface CaptainCall {
  stream(options: GenerateOptions): AsyncIterable<StreamChunk>
  resolveModelInfo?: (provider: string, model: string) => Promise<LlmResolvedModelInfo>
}

/** Host orchestrator for one synthetic Captain request. */
export class CaptainOrchestrator {
  private checkpoint: CaptainCheckpoint | undefined

  constructor(
    private readonly ctx: Context,
    private readonly config: () => CaptainConfig,
    private readonly llm: CaptainCall,
  ) {}

  /** Plan, execute, review, and return a user-facing summary. */
  async run(options: GenerateOptions): Promise<string> {
    const config = policyForRequest(this.config(), options.reasoningEffort)
    const routes = resolvedRoleRoutes(config)
    const taskText = await this.taskText(options, config.vision)
    if (isConversationalTask(taskText)) {
      const reply = await this.call(routes.planner, conversationalPrompt(taskText), options)
      return reply.text.trim() || taskText
    }
    const plan = parsePlan((await this.call(routes.planner, plannerPrompt(taskText), options)).text, taskText)
    validateTasks(plan.tasks)
    const budget = { used: 0 }
    const workers = await this.executeTasks(plan.tasks, plan.acceptance, routes.worker, options, config, budget)
    const reviewRoute = config.reviewerEnabled ? routes.reviewer : routes.worker
    const review = await this.review(plan, workers, reviewRoute, options, config)
    let currentReview = review
    let currentWorkers = workers
    for (let round = 0; !currentReview.pass && round < config.orchestration.maxRepairRounds; round += 1) {
      const repairs = repairTasks(plan.tasks, currentReview)
      if (repairs.length === 0) break
      const repaired = await this.executeTasks(repairs, plan.acceptance, routes.worker, options, config, budget, currentReview.summary)
      const byId = new Map(currentWorkers.map(worker => [worker.taskId, worker]))
      for (const worker of repaired) byId.set(worker.taskId, worker)
      currentWorkers = [...byId.values()]
      currentReview = await this.review(plan, currentWorkers, reviewRoute, options, config)
    }
    const diff = await this.readDiff()
    if (currentReview.pass) this.checkpoint = advanceCheckpoint(diff)
    const status = currentReview.pass ? 'Captain review passed.' : 'Captain review stopped with findings.'
    return [status, currentReview.summary, ...currentWorkers.map(worker => `- ${worker.taskId}: ${worker.ok ? 'done' : 'failed'}${worker.error ? ` (${worker.error})` : ''}${worker.output ? `\n${worker.output}` : ''}`), diff.patch ? `Incremental diff: ${diff.changedFiles.join(', ') || 'workspace changes'}` : 'Incremental diff: none'].join('\n')
  }

  private async executeTasks(
    tasks: readonly CaptainTask[],
    acceptance: readonly string[],
    route: CaptainRoleRoute,
    options: GenerateOptions,
    config: CaptainConfig,
    budget: { used: number },
    repairContext = '',
  ): Promise<CaptainWorkerResult[]> {
    const orchestration = config.orchestration
    const state = createSchedulerState(orchestration)
    const results: CaptainWorkerResult[] = []
    while (!isSettled(tasks, state)) {
      for (const task of settleBlockedTasks(tasks, state)) {
        results.push({ taskId: task.id, ok: false, output: '', changedFiles: [], tokens: 0, error: 'blocked by a failed dependency' })
      }
      if (isSettled(tasks, state)) break
      const ready = readyTasks(tasks, state)
      if (ready.length === 0) {
        if (state.running.size > 0) {
          await Promise.resolve()
          continue
        }
        throw new Error('Captain scheduler found no ready task; the planner produced an invalid dependency graph')
      }
      for (const task of ready) {
        if (budget.used + task.tokenBudget > orchestration.totalTokenBudget) {
          throw new Error(`Captain token budget exceeded before task ${task.id}`)
        }
        startTask(state, task, orchestration)
        budget.used += task.tokenBudget
      }
      const settled = await Promise.all(ready.map(async (task) => {
        try {
          const output = await this.worker(task, acceptance, route, options, repairContext)
          finishTask(state, task, { succeeded: true }, orchestration)
          return { taskId: task.id, ok: true, output, changedFiles: await this.changedFiles(), tokens: task.tokenBudget }
        } catch (error) {
          finishTask(state, task, failureObservation(error), orchestration)
          return { taskId: task.id, ok: false, output: '', changedFiles: [], tokens: task.tokenBudget, error: String(error) }
        }
      }))
      results.push(...settled)
    }
    return results
  }

  private async worker(
    task: CaptainTask,
    acceptance: readonly string[],
    route: CaptainRoleRoute,
    options: GenerateOptions,
    repairContext: string,
  ): Promise<string> {
    const prompt = [
      'You are a DeepSeek implementation worker inside Captain.',
      `Task ${task.id}: ${task.prompt}`,
      `Owned files: ${task.files.join(', ') || '(infer from repository)'}`,
      `Acceptance criteria: ${acceptance.join('; ') || '(none)'}`,
      repairContext ? `Reviewer feedback to fix:\n${repairContext}` : '',
      'Inspect the workspace, make the required incremental changes, run focused checks, and report changed files plus tests.',
    ].filter(Boolean).join('\n')
    const parent = options.sessionId === undefined ? undefined : this.ctx.agents.get(options.sessionId)
    const workflow = this.ctx.get('workflowEngine')
    if (parent !== undefined && workflow !== undefined) {
      const script = `return await agent(${JSON.stringify(prompt)}, ${JSON.stringify({ label: task.id, provider: route.provider, model: route.model })})`
      const run = workflow.start({
        script,
        meta: { name: `captain-${task.id}`, description: 'Captain worker' },
        parent,
        ...options.signal === undefined ? {} : { signal: options.signal },
      })
      const result = await run.result
      await run.dispose()
      if (result.stopReason !== 'completed') throw new Error(`worker ${task.id} stopped: ${result.stopReason}`)
      return typeof result.value === 'string' ? result.value : JSON.stringify(result.value)
    }
    return (await this.call(route, prompt, options)).text
  }

  private async review(
    plan: CaptainPlan,
    workers: readonly CaptainWorkerResult[],
    route: CaptainRoleRoute,
    options: GenerateOptions,
    config: CaptainConfig,
  ) {
    const diff = await this.readDiff()
    const prompt = reviewPrompt(plan.acceptance, workers, diff.patch)
    const result = await this.call(route, prompt, options, config.orchestration.reviewerTokenBudget)
    return parseReview(result.text)
  }

  private async taskText(options: GenerateOptions, route: CaptainRoleRoute): Promise<string> {
    const message = latestUserMessage(options.messages)
    const task = message === undefined ? '' : textOf(message)
    const images = message === undefined ? [] : imageInputsOf([message])
    if (images.length === 0) return task
    const prompt = 'Inspect the attached images and summarize only details relevant to the user task. Return concise factual notes for the GPT planner and DeepSeek implementation workers.'
    const request = visionRequest(route, [createUserMessage({
      content: [{ type: 'text', text: prompt }],
      source: { kind: 'user' },
    })], images)
    const vision = await collectText(this.llm.stream({
      ...request,
      ...await this.reasoningOptions(route),
      ...options.system === undefined ? {} : { system: options.system },
      ...options.signal === undefined ? {} : { signal: options.signal },
      ...options.sessionId === undefined ? {} : { sessionId: options.sessionId },
      ...options.maxTokens === undefined ? {} : { maxTokens: options.maxTokens },
    }))
    return `${task}\n\nVision companion notes:\n${vision.text}`
  }

  private async call(route: CaptainRoleRoute, prompt: string, source: GenerateOptions, maxTokens?: number): Promise<CaptainTextResult> {
    const reasoning = await this.reasoningOptions(route)
    return collectText(this.llm.stream({
      provider: route.provider,
      model: route.model,
      messages: [createUserMessage({ content: [{ type: 'text', text: prompt }], source: { kind: 'user' } })],
      ...reasoning,
      ...source.system === undefined ? {} : { system: source.system },
      ...source.signal === undefined ? {} : { signal: source.signal },
      ...maxTokens === undefined ? {} : { maxTokens },
    }))
  }

  /** Keep Captain policy labels compatible with the selected provider model. */
  private async reasoningOptions(route: CaptainRoleRoute): Promise<Pick<GenerateOptions, 'reasoningEffort'>> {
    if (route.reasoningEffort === '' || this.llm.resolveModelInfo === undefined) return route.reasoningEffort === ''
      ? {}
      : { reasoningEffort: ReasoningEffortId(route.reasoningEffort) }

    const model = await this.llm.resolveModelInfo(route.provider, route.model)
    const supported = model.reasoning?.efforts.map(effort => String(effort.id)) ?? []
    const selected = compatibleReasoningEffort(route.reasoningEffort, supported)
    return selected === undefined ? {} : { reasoningEffort: ReasoningEffortId(selected) }
  }

  private async readDiff() {
    const git: GitReader = {
      run: async (args) => {
        const { execFile } = await import('node:child_process')
        return new Promise<string>((resolve, reject) => {
          execFile('git', [...args], { cwd: process.cwd(), maxBuffer: 16 * 1024 * 1024 }, (error: Error | null, stdout: string) => {
            if (error) reject(error)
            else resolve(stdout)
          })
        })
      },
    }
    try {
      return await incrementalDiff(git, this.checkpoint)
    } catch {
      return { head: 'unknown', patch: '', changedFiles: [], hash: '00000000' }
    }
  }

  private async changedFiles(): Promise<string[]> {
    const diff = await this.readDiff()
    // The checkpoint is intentionally advanced only by a passing reviewer;
    // this projection is read-only and gives the reviewer current paths.
    return diff.changedFiles
  }
}

function policyForRequest(config: CaptainConfig, effort: GenerateOptions['reasoningEffort']): CaptainConfig {
  const selected = effort === undefined ? undefined : String(effort)
  if (selected !== 'balanced' && selected !== 'high-quality' && selected !== 'ultra') return config
  return { ...config, policy: selected }
}

function imageInputsOf(messages: readonly Message[]): CaptainImageInput[] {
  const images: CaptainImageInput[] = []
  const visit = (blocks: readonly ContentBlock[]): void => {
    for (const block of blocks) {
      if (block.type === 'image') images.push({ ref: block.attachment })
      else if (block.type === 'tool-result') visit(block.content)
    }
  }
  for (const message of messages) visit(message.content)
  return images
}

function failureObservation(error: unknown): { succeeded: false; rateLimited?: boolean; timedOut?: boolean } {
  const code = typeof error === 'object' && error !== null && 'failure' in error
    ? (error as { failure?: { code?: unknown } }).failure?.code
    : undefined
  const message = String(error).toLowerCase()
  return {
    succeeded: false,
    rateLimited: code === 'RATE_LIMIT' || message.includes('rate limit') || message.includes('429'),
    timedOut: code === 'TIMEOUT' || message.includes('timeout'),
  }
}

/** Collect visible text and usage from a canonical stream. */
export async function collectText(stream: AsyncIterable<StreamChunk>): Promise<CaptainTextResult> {
  const chunks: StreamChunk[] = []
  let text = ''
  let outputTokens: number | undefined
  for await (const chunk of stream) {
    chunks.push(chunk)
    if (chunk.type === 'text-delta') text += chunk.text
    if (chunk.type === 'block-end' && chunk.block.type === 'text') text += text.endsWith(chunk.block.text) ? '' : chunk.block.text
    if (chunk.type === 'usage') outputTokens = chunk.usage.outputTokens
    if (chunk.type === 'finish' && (chunk.reason.kind === 'error' || chunk.reason.kind === 'aborted')) {
      const error = new Error(chunk.reason.failure.message) as Error & { failure: typeof chunk.reason.failure; code: string }
      error.failure = chunk.reason.failure
      error.code = chunk.reason.failure.code
      throw error
    }
  }
  return { text, chunks, ...outputTokens === undefined ? {} : { outputTokens } }
}

function plannerPrompt(task: string): string {
  return ['You are the GPT planning brain inside Captain.', 'Turn the task into a small dependency DAG. Return JSON only:', '{"tasks":[{"id":string,"prompt":string,"dependsOn":string[],"files":string[],"tokenBudget":number}],"acceptance":string[]}', 'Use independent tasks for parallel work and never assign overlapping files to independent tasks.', `User task:\n${task}`].join('\n\n')
}

/** Identify short social turns that should not start a repository-changing run. */
export function isConversationalTask(task: string): boolean {
  return /^(?:\u65e9\u4e0a\u597d|\u4e2d\u5348\u597d|\u4e0b\u5348\u597d|\u665a\u4e0a\u597d|\u5348\u5b89|\u665a\u5b89|\u4f60\u597d|\u60a8\u597d|\u55e8|\u54c8\u55bd|hello|hi|hey|\u5728\u5417|\u5728\u7ebf\u5417|\u8c22\u8c22|\u591a\u8c22)[!！,.\uFF0C\u3002?？\s]*$/iu.test(task.trim())
}

function conversationalPrompt(task: string): string {
  return `Reply naturally to this short conversational message. Do not plan code, call tools, return JSON, or mention Captain internals. Return only the user-facing reply.\n\nUser message: ${task}`
}

function parsePlan(raw: string, fallback: string): CaptainPlan {
  const candidate = raw.match(/\{[\s\S]*\}/)?.[0]
  if (candidate !== undefined) {
    try {
      const value: unknown = JSON.parse(candidate)
      if (isRecord(value) && Array.isArray(value.tasks)) {
        const tasks = value.tasks.flatMap((item, index): CaptainTask[] => {
          if (!isRecord(item) || typeof item.prompt !== 'string') return []
          return [{
            id: typeof item.id === 'string' ? item.id : `task-${index + 1}`,
            prompt: item.prompt,
            dependsOn: Array.isArray(item.dependsOn) ? item.dependsOn.filter((id): id is string => typeof id === 'string') : [],
            files: Array.isArray(item.files) ? item.files.filter((file): file is string => typeof file === 'string') : [],
            tokenBudget: typeof item.tokenBudget === 'number' && item.tokenBudget > 0 ? item.tokenBudget : 8000,
          }]
        })
        if (tasks.length > 0) return { tasks, acceptance: Array.isArray(value.acceptance) ? value.acceptance.filter((item): item is string => typeof item === 'string') : [] }
      }
    } catch { /* fallback below */ }
  }
  return { tasks: [{ id: 'task-1', prompt: fallback, dependsOn: [], files: [], tokenBudget: 8000 }], acceptance: [] }
}

/**
 * Return text from the latest direct user message, excluding history and injected context.
 * @param messages - Complete model request history.
 * @returns Text blocks from the latest direct user message, or an empty string when absent.
 */
export function currentTaskText(messages: readonly Message[]): string {
  const message = latestUserMessage(messages)
  return message === undefined ? '' : textOf(message)
}

function latestUserMessage(messages: readonly Message[]): Message | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message !== undefined && message.role === 'user' && message.source.kind === 'user') return message
  }
  return undefined
}

function textOf(message: Message): string {
  return message.content.flatMap(block => block.type === 'text' ? [block.text] : []).join('\n')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
