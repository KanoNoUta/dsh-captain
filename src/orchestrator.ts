import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import {
  createUserMessage,
  freezeMessage,
  type ContentBlock,
  type GenerateOptions,
  type LlmModelInfo,
  type LlmResolvedModelInfo,
  type Message,
  ReasoningEffortId,
} from '@deepseek-ai/dsh-llm'
import type { StreamChunk } from '@deepseek-ai/dsh-llm'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type {
  CaptainCheckpoint,
  CaptainConfig,
  CaptainPlan,
  CaptainReview,
  CaptainRepositoryReader,
  CaptainRoleRoute,
  CaptainTextResult,
  CaptainWorkerResult,
} from './types.ts'
import { compatibleReasoningEffort, resolvedRoleRoutes } from './presets.ts'
import { advanceCheckpoint, incrementalDiff, type GitReader, type IncrementalDiff } from './diff.ts'
import { parseReview, reviewNeedsRetry, reviewPrompt } from './reviewer.ts'
import { validateTasks } from './scheduler.ts'
import { resolveVisionRoute, visionRequest, type CaptainImageInput } from './vision.ts'
import { formatRepositoryContext } from './repository-context.ts'

/** LLM call facade kept small so the orchestrator is deterministic in tests. */
export interface CaptainCall {
  /** Stream one provider-neutral model request. */
  stream(options: GenerateOptions): AsyncIterable<StreamChunk>
  /** List one provider's catalog when vision routing needs capability metadata. */
  listModels?: (provider: string) => Promise<readonly LlmModelInfo[]>
  /** Resolve exact-model metadata before selecting a compatible effort. */
  resolveModelInfo?: (provider: string, model: string) => Promise<LlmResolvedModelInfo>
}

/** GPT control-plane progress exposed to the synthetic outer stream. */
export type CaptainControlEvent =
  | { type: 'start'; role: 'planner' | 'reviewer'; route: CaptainRoleRoute }
  | { type: 'delta'; role: 'planner' | 'reviewer'; text: string }
  | { type: 'end'; role: 'planner' | 'reviewer'; route: CaptainRoleRoute }

/** Receive one GPT planner or reviewer lifecycle fact for the active Captain request. */
export type CaptainControlObserver = (event: CaptainControlEvent) => void

// GPT planning needs the recent conversation, not an unbounded replay of
// tool output. Keep this fixed safety cap below the context size of the
// configured relay so a long worker session cannot make planning unstable.
const MAX_PLANNER_CONTEXT_CHARS = 180_000

/** A direct GPT response that bypasses repository execution. */
export interface CaptainDirectTurn {
  kind: 'direct'
  text: string
}

/** A GPT plan converted into instructions for the parent Agent's native DeepSeek loop. */
export interface CaptainExecutionTurn {
  kind: 'execution'
  plan: CaptainPlan
  directive: string
}

/** Result of the independent incremental-diff review. */
export interface CaptainReviewResult {
  review: CaptainReview
  diff: IncrementalDiff & { available: boolean }
}

/** Host control plane for GPT planning, native DeepSeek execution, and GPT review. */
export class CaptainOrchestrator {
  private checkpoint: CaptainCheckpoint | undefined
  private checkpointCwd: string | undefined

  constructor(
    private readonly ctx: Context,
    private readonly config: () => CaptainConfig,
    private readonly llm: CaptainCall,
    private readonly repository?: CaptainRepositoryReader,
  ) {}

  /**
   * Prepare a new direct-user turn without starting a hidden worker Session.
   * @param options - Parent Agent model request.
   * @param observe - Optional GPT reasoning observer.
   * @returns A direct answer or the plan handed to the native DeepSeek loop.
   */
  async prepare(options: GenerateOptions, observe?: CaptainControlObserver): Promise<CaptainDirectTurn | CaptainExecutionTurn> {
    const config = policyForRequest(this.config(), options.reasoningEffort)
    const routes = resolvedRoleRoutes(config)
    const input = await this.taskInput(options, config.vision)
    if (input.visionNotes !== undefined && isImageAnalysisTask(input.text)) {
      return { kind: 'direct', text: input.visionNotes.trim() || input.text }
    }
    const taskText = input.visionNotes === undefined
      ? input.text
      : `${input.text}\n\nVision companion notes:\n${input.visionNotes}`
    if (isConversationalTask(taskText)) {
      try {
        const reply = await this.call(routes.planner, conversationalPrompt(taskText), options, undefined, observe, 'planner')
        return { kind: 'direct', text: reply.text.trim() || taskText }
      } catch (error: unknown) {
        if (options.signal?.aborted === true || !isRecoverablePlannerFailure(error)) throw error
        this.ctx.logger?.warn(`captain: planner conversation failed; returning the user text: ${String(error)}`)
        return { kind: 'direct', text: taskText.trim() || '收到。' }
      }
    }
    const cwd = workspaceCwdFor(this.ctx, options.sessionId)
    let repositoryContext: string | undefined
    if (this.repository !== undefined && cwd !== undefined) {
      try {
        const context = await this.repository.inspect(taskText, cwd, options.signal)
        repositoryContext = context === undefined ? undefined : formatRepositoryContext(context)
      } catch (error: unknown) {
        if (options.signal?.aborted === true) throw error
        this.ctx.logger.warn(`captain: repository analysis unavailable; planning from parent context: ${String(error)}`)
      }
    }
    let result: CaptainTextResult | undefined
    try {
      result = await this.call(routes.planner, plannerPrompt(taskText, repositoryContext), options, undefined, observe, 'planner', true)
    } catch (error: unknown) {
      if (options.signal?.aborted === true || !isRecoverablePlannerFailure(error)) throw error
      this.ctx.logger?.warn(`captain: planner transport failed; falling back to native execution: ${String(error)}`)
    }
    const plan = parsePlan(result?.text ?? '', taskText)
    validateTasks(plan.tasks)
    return { kind: 'execution', plan, directive: nativeExecutionDirective(plan, config) }
  }

  /**
   * Reconstruct a minimal execution turn after a Host restart without asking GPT to plan a tool-result continuation again.
   * @param options - Parent request whose history still contains the direct user task.
   * @returns A single-task native execution plan.
   */
  recover(options: GenerateOptions): CaptainExecutionTurn {
    const config = policyForRequest(this.config(), options.reasoningEffort)
    const task = currentTaskText(options.messages)
    const plan = fallbackPlan(task)
    return { kind: 'execution', plan, directive: nativeExecutionDirective(plan, config) }
  }

  /**
   * Build the DeepSeek request that runs inside the parent Agent's native tool loop.
   * @param options - Original parent request including system prompt, tools, history, and cancellation.
   * @param turn - GPT plan for this user turn.
   * @param feedback - Optional independent-review findings for a repair pass.
   * @returns A worker-routed request preserving every parent execution capability.
   */
  async workerRequest(
    options: GenerateOptions,
    turn: CaptainExecutionTurn,
    feedback?: string,
  ): Promise<GenerateOptions> {
    const config = policyForRequest(this.config(), options.reasoningEffort)
    const route = resolvedRoleRoutes(config).worker
    const reasoning = await this.reasoningOptions(route)
    const directive = feedback === undefined
      ? turn.directive
      : `${turn.directive}\n\nGPT independent review requires another implementation pass:\n${feedback}\nUse the native tools now, fix every finding, rerun focused checks, and only then report completion.`
    const {
      provider: _captainProvider,
      model: _captainModel,
      reasoningEffort: _captainEffort,
      messages: parentMessages,
      ...parentExecutionOptions
    } = options
    return {
      ...parentExecutionOptions,
      provider: route.provider,
      model: route.model,
      messages: [
        ...messagesWithoutImages(parentMessages),
        createUserMessage({
          content: [{ type: 'text', text: directive }],
          source: { kind: 'plugin', plugin: 'captain', form: 'relay' },
        }),
      ],
      ...reasoning,
    }
  }

  /**
   * Review one completed native DeepSeek pass against the current incremental Git diff.
   * @param plan - GPT plan whose acceptance criteria govern the review.
   * @param workerOutput - Visible final text from the native DeepSeek pass.
   * @param options - Parent request providing session identity and cancellation.
   * @param observe - Optional reviewer reasoning observer.
   * @returns Structured review plus the reviewed diff metadata.
   */
  async review(
    plan: CaptainPlan,
    workerOutput: string,
    options: GenerateOptions,
    observe?: CaptainControlObserver,
  ): Promise<CaptainReviewResult> {
    const config = policyForRequest(this.config(), options.reasoningEffort)
    const routes = resolvedRoleRoutes(config)
    const route = routes.reviewer
    const workspaceCwd = workspaceCwdFor(this.ctx, options.sessionId)
    const diff = await this.readDiff(workspaceCwd)
    const workers: CaptainWorkerResult[] = [{
      taskId: 'deepseek-primary',
      ok: true,
      output: workerOutput,
      changedFiles: diff.changedFiles,
      tokens: 0,
    }]
    const prompt = [
      `Planned task DAG:\n${JSON.stringify(plan.tasks)}`,
      'Judge the actual plan and acceptance criteria. An empty Git diff is correct when the plan explicitly requires observation, conversation, native-tool/UI verification, or no file changes. Do not treat a zero token-accounting placeholder as evidence that execution did not occur.',
      reviewPrompt(plan.acceptance, workers, diff.patch),
    ].join('\n\n')
    const first = await this.call(route, prompt, options, config.orchestration.reviewerTokenBudget, observe, 'reviewer')
    let review = parseReview(first.text)
    if (reviewNeedsRetry(review)) {
      const correction = [
        prompt,
        'Your previous response was not valid reviewer JSON. Return exactly one JSON object and no prose, Markdown, DSML, function calls, or tool calls.',
      ].join('\n\n')
      review = parseReview((await this.call(
        route,
        correction,
        options,
        config.orchestration.reviewerTokenBudget,
        observe,
        'reviewer',
      )).text)
    }
    if (review.pass && diff.available) {
      this.checkpoint = advanceCheckpoint(diff)
      this.checkpointCwd = workspaceCwd
    }
    return { review, diff }
  }

  /** Return the configured maximum number of repair passes for one task turn.
   * @returns Maximum repair passes configured for the current Captain run.
   */
  maxRepairRounds(): number {
    return this.config().orchestration.maxRepairRounds
  }

  private async taskInput(options: GenerateOptions, route: CaptainRoleRoute): Promise<{ text: string; visionNotes?: string }> {
    const message = latestDirectUserMessage(options.messages)
    const task = message === undefined ? '' : textOf(message)
    const images = message === undefined ? [] : imageInputsOf([message])
    if (images.length === 0) return { text: task }
    const visionRoute = this.llm.listModels === undefined
      ? { ...route, reasoningEffort: '' }
      : resolveVisionRoute(route, await this.llm.listModels(route.provider))
    const prompt = 'Inspect the attached images and summarize only details relevant to the user task. Return concise factual notes for the GPT planner and DeepSeek executor.'
    const request = visionRequest(visionRoute, [createUserMessage({
      content: [{ type: 'text', text: prompt }],
      source: { kind: 'user' },
    })], images)
    const vision = await collectText(this.llm.stream({
      ...request,
      ...options.system === undefined ? {} : { system: options.system },
      ...options.signal === undefined ? {} : { signal: options.signal },
      ...options.sessionId === undefined ? {} : { sessionId: options.sessionId },
      ...options.maxTokens === undefined ? {} : { maxTokens: options.maxTokens },
    }))
    return { text: task, visionNotes: vision.text }
  }

  private async call(
    route: CaptainRoleRoute,
    prompt: string,
    source: GenerateOptions,
    maxTokens?: number,
    observe?: CaptainControlObserver,
    role?: 'planner' | 'reviewer',
    inheritParentContext = false,
  ): Promise<CaptainTextResult> {
    const reasoning = await this.reasoningOptions(route)
    const control = observe !== undefined && role !== undefined && isGptControlRoute(route)
    if (control) observe({ type: 'start', role, route })
    try {
      return await collectText(this.llm.stream({
        provider: route.provider,
        model: route.model,
        messages: [
          ...(inheritParentContext ? plannerMessages(source.messages) : []),
          createUserMessage({ content: [{ type: 'text', text: prompt }], source: { kind: 'user' } }),
        ],
        ...(inheritParentContext && source.system !== undefined ? { system: source.system } : {}),
        ...reasoning,
        ...source.signal === undefined ? {} : { signal: source.signal },
        ...maxTokens === undefined ? {} : { maxTokens },
      }), (chunk) => {
        if (control && chunk.type === 'reasoning-delta') observe({ type: 'delta', role, text: chunk.text })
      })
    } finally {
      if (control) observe({ type: 'end', role, route })
    }
  }

  private async reasoningOptions(route: CaptainRoleRoute): Promise<Pick<GenerateOptions, 'reasoningEffort'>> {
    if (route.reasoningEffort === '' || this.llm.resolveModelInfo === undefined) return route.reasoningEffort === ''
      ? {}
      : { reasoningEffort: ReasoningEffortId(route.reasoningEffort) }
    const model = await this.llm.resolveModelInfo(route.provider, route.model)
    const supported = model.reasoning?.efforts.map(effort => String(effort.id)) ?? []
    const selected = compatibleReasoningEffort(route.reasoningEffort, supported)
    return selected === undefined ? {} : { reasoningEffort: ReasoningEffortId(selected) }
  }

  private async readDiff(workspaceCwd: string | undefined): Promise<IncrementalDiff & { available: boolean }> {
    if (workspaceCwd === undefined) return { head: 'unknown', patch: '', changedFiles: [], hash: '00000000', available: false }
    const git: GitReader = {
      run: async (args) => {
        const { execFile } = await import('node:child_process')
        return new Promise<string>((resolve, reject) => {
          execFile('git', [...args], { cwd: workspaceCwd, maxBuffer: 16 * 1024 * 1024 }, (error: Error | null, stdout: string) => {
            if (error) reject(error)
            else resolve(stdout)
          })
        })
      },
    }
    try {
      const checkpoint = this.checkpointCwd === workspaceCwd ? this.checkpoint : undefined
      return { ...await incrementalDiff(git, checkpoint), available: true }
    } catch {
      return { head: 'unknown', patch: '', changedFiles: [], hash: '00000000', available: false }
    }
  }
}

/**
 * Resolve the repository working directory carried by the parent Agent session.
 * @param ctx - Host context containing the live Agent registry.
 * @param sessionId - Parent Agent identity from the model request.
 * @returns The session workspace path, or undefined without a live parent workspace.
 */
export function workspaceCwdFor(ctx: Context, sessionId: SessionId | undefined): string | undefined {
  return sessionId === undefined ? undefined : ctx.agents.get(sessionId)?.session.header.cwd
}

/** Collect visible text and usage from a canonical stream.
 * @param stream - Canonical model stream to consume.
 * @param observe - Optional callback for each received chunk.
 * @returns Collected visible text, chunks, and output token usage.
 */
export async function collectText(
  stream: AsyncIterable<StreamChunk>,
  observe?: (chunk: StreamChunk) => void,
): Promise<CaptainTextResult> {
  const chunks: StreamChunk[] = []
  let text = ''
  let outputTokens: number | undefined
  for await (const chunk of stream) {
    chunks.push(chunk)
    observe?.(chunk)
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

function nativeExecutionDirective(plan: CaptainPlan, config: CaptainConfig): string {
  const tasks = plan.tasks.map((task, index) => [
    `${index + 1}. [${task.id}] ${task.prompt}`,
    `   files: ${task.files.join(', ') || 'infer from the repository'}`,
    `   depends on: ${task.dependsOn.join(', ') || 'none'}`,
  ].join('\n')).join('\n')
  const concurrency = config.orchestration.mode === 'fixed'
    ? `Use up to ${config.orchestration.maxParallel || config.orchestration.maxAgents} native subagents concurrently.`
    : `Choose ${config.orchestration.minAgents}-${config.orchestration.maxAgents} native subagents adaptively; never exceed ${config.orchestration.maxParallel || config.orchestration.maxAgents} concurrent agents.`
  return [
    'GPT Captain plan:',
    tasks,
    `Acceptance criteria:\n${plan.acceptance.map(item => `- ${item}`).join('\n') || '- Complete and verify the user request.'}`,
    'You are the primary DeepSeek executor in the current Harness Agent.',
    'First synchronize this DAG through the native todo_write tool. Then execute the plan with only the tools and file changes it actually requires; do not edit files when the task explicitly requires no changes.',
    'Use the native subagent and workflow tools when independent work benefits from parallel execution; their tool calls must be emitted normally so Harness renders native tool cards and child-Agent UI.',
    concurrency,
    'Do not print DSML, XML, function-call markup, or simulated tool logs as text. Call the provided tools directly.',
  ].join('\n\n')
}

function plannerPrompt(task: string, repositoryContext?: string): string {
  return [
    'You are the GPT planning brain inside Captain.',
    'Turn the task into a small dependency DAG. Return JSON only:',
    '{"tasks":[{"id":string,"prompt":string,"dependsOn":string[],"files":string[],"tokenBudget":number}],"acceptance":string[]}',
    'Use independent tasks for parallel work and never assign overlapping files to independent tasks.',
    ...repositoryContext === undefined ? [] : [repositoryContext],
    `User task:\n${task}`,
  ].join('\n\n')
}

/** Identify short social turns that should not start a repository-changing run.
 * @param task - Normalized user task text.
 * @returns True when the task is a short conversational greeting or thanks.
 */
export function isConversationalTask(task: string): boolean {
  const socialTurn = [
    '早上好', '中午好', '下午好', '晚上好', '午安', '晚安', '你好', '您好', '嗨', '哈喽',
    'hello', 'hi', 'hey', '在吗', '在线吗', '谢谢', '多谢',
  ].join('|')
  return new RegExp(`^(?:${socialTurn})[!！,.，。?？\\s]*$`, 'iu').test(task.trim())
}

/** Whether a short image turn asks only for visual facts rather than repository work.
 * @param task - Normalized user task text.
 * @returns True when the task requests image facts without implementation work.
 */
export function isImageAnalysisTask(task: string): boolean {
  const normalized = task.trim()
  if (normalized.length === 0 || normalized.length > 300) return false
  const asksAboutImage = /(?:识别|描述|说明|看看|看下|图里|图片|截图|image|screenshot|photo|picture)/i.test(normalized)
  const requestsImplementation = /(?:修复|修改|实现|代码|编写|开发|部署|提交|发布|fix|change|implement|code|build|deploy|commit|release)/i.test(normalized)
  return asksAboutImage && !requestsImplementation
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
        const tasks = value.tasks.flatMap((item, index) => {
          if (!isRecord(item) || typeof item.prompt !== 'string') return []
          return [{
            id: typeof item.id === 'string' ? item.id : `task-${index + 1}`,
            prompt: item.prompt,
            dependsOn: Array.isArray(item.dependsOn) ? item.dependsOn.filter((id): id is string => typeof id === 'string') : [],
            files: Array.isArray(item.files) ? item.files.filter((file): file is string => typeof file === 'string') : [],
            tokenBudget: typeof item.tokenBudget === 'number' && item.tokenBudget > 0 ? item.tokenBudget : 8000,
          }]
        })
        if (tasks.length > 0) return {
          tasks,
          acceptance: Array.isArray(value.acceptance) ? value.acceptance.filter((item): item is string => typeof item === 'string') : [],
        }
      }
    } catch {
      // Fall through to one native executor task when the planner response is not valid JSON.
    }
  }
  return { tasks: [{ id: 'task-1', prompt: fallback, dependsOn: [], files: [], tokenBudget: 8000 }], acceptance: [] }
}

/**
 * Return text from the latest direct user message, excluding tool results and injected context.
 * @param messages - Complete model request history.
 * @returns Text blocks from the latest direct user message, or an empty string when absent.
 */
export function currentTaskText(messages: readonly Message[]): string {
  const message = latestDirectUserMessage(messages)
  return message === undefined ? '' : textOf(message)
}

function latestDirectUserMessage(messages: readonly Message[]): Message | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message !== undefined && message.role === 'user' && message.source.kind === 'user') return message
  }
  return undefined
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

/**
 * Remove image blocks before replaying parent history through a text-only worker route.
 * @param messages - Parent history whose images have already been summarized by the Vision route.
 * @returns Original messages without images, preserving unchanged message identities.
 */
function plannerMessages(messages: readonly Message[]): Message[] {
  const withoutImages = messagesWithoutImages(messages)
  if (messageChars(withoutImages) <= MAX_PLANNER_CONTEXT_CHARS) return withoutImages

  let remaining = MAX_PLANNER_CONTEXT_CHARS
  const compacted: Message[] = []
  for (let index = withoutImages.length - 1; index >= 0 && remaining > 0; index -= 1) {
    const source = withoutImages[index]
    if (source === undefined) continue
    const message = compactPlannerMessage(source, remaining)
    if (message === undefined) continue
    compacted.unshift(message)
    remaining -= messageChars([message])
  }
  return compacted
}

function compactPlannerMessage(message: Message, budget: number): Message | undefined {
  const content: ContentBlock[] = []
  let remaining = budget
  for (const block of message.content) {
    if (remaining <= 0) break
    if (block.type !== 'text') continue
    const text = truncatePlannerText(block.text, remaining)
    if (text.length === 0) continue
    content.push({ type: 'text', text })
    remaining -= text.length
  }
  return content.length === 0 ? undefined : freezeMessage({ ...message, content })
}

function truncatePlannerText(text: string, budget: number): string {
  if (text.length <= budget) return text
  if (budget <= 64) return text.slice(0, budget)
  const head = Math.floor((budget - 40) * 0.65)
  const tail = budget - 40 - head
  return `${text.slice(0, head)}\n...[planner context truncated]...\n${text.slice(-tail)}`
}

function messageChars(messages: readonly Message[]): number {
  return messages.reduce((total, message) => total + message.content.reduce((size, block) => {
    if (block.type === 'text' || block.type === 'reasoning') return size + block.text.length
    if (block.type === 'tool-call') return size + block.arguments.length + block.name.length
    if (block.type === 'image') return size
    return size + messageChars([{ ...message, content: block.content }])
  }, 0), 0)
}

function fallbackPlan(task: string): CaptainPlan {
  return {
    tasks: [{ id: 'task-1', prompt: task || 'Continue the current tool-driven implementation.', dependsOn: [], files: [], tokenBudget: 8000 }],
    acceptance: [],
  }
}

function isRecoverablePlannerFailure(error: unknown): boolean {
  if (!isRecord(error)) return false
  const code = typeof error.code === 'string'
    ? error.code
    : isRecord(error.failure) && typeof error.failure.code === 'string' ? error.failure.code : undefined
  return code !== undefined && new Set(['EMPTY_RESPONSE', 'RATE_LIMIT', 'SERVER', 'TIMEOUT', 'TRANSPORT', 'STREAM_CLOSED']).has(code)
}

function messagesWithoutImages(messages: readonly Message[]): Message[] {
  return messages.map((message) => {
    const content = blocksWithoutImages(message.content)
    return content === message.content ? message : freezeMessage({ ...message, content })
  })
}

function blocksWithoutImages(blocks: readonly ContentBlock[]): ContentBlock[] {
  let changed = false
  const content: ContentBlock[] = []
  for (const block of blocks) {
    if (block.type === 'image') {
      changed = true
      continue
    }
    if (block.type === 'tool-result') {
      const nested = blocksWithoutImages(block.content)
      if (nested !== block.content) {
        changed = true
        content.push({ ...block, content: nested })
        continue
      }
    }
    content.push(block)
  }
  return changed ? content : blocks as ContentBlock[]
}

function textOf(message: Message): string {
  return message.content.flatMap(block => block.type === 'text' ? [block.text] : []).join('\n')
}

function policyForRequest(config: CaptainConfig, effort: GenerateOptions['reasoningEffort']): CaptainConfig {
  const selected = effort === undefined ? undefined : String(effort)
  if (selected !== 'balanced' && selected !== 'high-quality' && selected !== 'ultra') return config
  return { ...config, policy: selected }
}

function isGptControlRoute(route: CaptainRoleRoute): boolean {
  return route.provider === 'gpt-relay' && /^gpt-/iu.test(route.model)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
