import type { Context } from '@deepseek-ai/cordis'
import { LlmAdapter, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import type { ContentBlock, GenerateOptions, LlmModelInfo, LlmProviderInfo, LlmResolvedModelInfo, StreamChunk } from '@deepseek-ai/dsh-llm'
import type { CaptainConfig, CaptainCatalogModel, CaptainFinding, CaptainRepositoryReader } from './types.ts'
import {
  CaptainOrchestrator,
  type CaptainControlEvent,
  type CaptainExecutionTurn,
} from './orchestrator.ts'
import { FileSystemRepositoryReader } from './repository-context.ts'

/** Synthetic provider id shown as the native model-directory group. */
export const CAPTAIN_PROVIDER = 'captain'

interface ActiveCaptainRun {
  turn: CaptainExecutionTurn
  repairRounds: number
  feedback?: string
}

interface OpenBlock {
  outerIndex: number
  type: ContentBlock['type']
  text: string
  id?: string
  name?: string
  arguments: string
}

class StreamQueue<T> implements AsyncIterable<T>, AsyncIterator<T> {
  private readonly values: T[] = []
  private waiter: { resolve: (value: IteratorResult<T>) => void; reject: (error: unknown) => void } | undefined
  private closed = false
  private failure: unknown

  push(value: T): void {
    if (this.closed) throw new Error('Captain stream queue is closed')
    const waiter = this.waiter
    if (waiter === undefined) this.values.push(value)
    else {
      this.waiter = undefined
      waiter.resolve({ done: false, value })
    }
  }

  close(): void {
    this.closed = true
    const waiter = this.waiter
    if (waiter === undefined) return
    this.waiter = undefined
    waiter.resolve({ done: true, value: undefined as never })
  }

  fail(error: unknown): void {
    this.failure = error
    this.closed = true
    const waiter = this.waiter
    if (waiter === undefined) return
    this.waiter = undefined
    waiter.reject(error)
  }

  async next(): Promise<IteratorResult<T>> {
    const value = this.values.shift()
    if (value !== undefined) return { done: false, value }
    if (this.failure !== undefined) {
      if (this.failure instanceof Error) throw this.failure
      throw new Error(typeof this.failure === 'string' ? this.failure : 'Captain stream failed')
    }
    if (this.closed) return { done: true, value: undefined as never }
    return new Promise<IteratorResult<T>>((resolve, reject) => {
      this.waiter = { resolve, reject }
    })
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return this
  }
}

/** Adapter that keeps GPT on the control plane while DeepSeek uses the parent Agent's native tool loop. */
export class CaptainAdapter extends LlmAdapter {
  private readonly orchestrator: CaptainOrchestrator
  private readonly activeRuns = new Map<string, ActiveCaptainRun>()

  constructor(private readonly ctx: Context, private readonly config: () => CaptainConfig, repository?: CaptainRepositoryReader) {
    super()
    this.orchestrator = new CaptainOrchestrator(ctx, config, ctx.llm, repository ?? new FileSystemRepositoryReader(ctx.fs))
  }

  override providerInfo(provider: string): LlmProviderInfo {
    return { id: provider, name: 'Captain / 船长' }
  }

  override async listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    const config = this.config()
    const providers = new Set(this.ctx.llm.listProviders().map(item => item.id))
    const requiredProviders = [config.planner.provider, config.worker.provider]
    if (config.reviewerEnabled) requiredProviders.push(config.reviewer.provider)
    if (!requiredProviders.every(id => providers.has(id))) return []
    const model = await this.catalogModel(config)
    return [{ provider, id: model.id, name: model.name, description: model.description, inputModalities: ['text', 'image'] }]
  }

  override async resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    const entry = await this.catalogModel(this.config())
    return {
      provider,
      id: model,
      name: entry.name,
      description: entry.description,
      inputModalities: ['text', 'image'],
      reasoning: {
        efforts: entry.reasoningEfforts,
        defaultEffort: ReasoningEffortId(this.config().policy),
      },
    }
  }

  override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const queue = new StreamQueue<StreamChunk>()
    void this.runNative(options, queue).then(() => { queue.close() }, (error: unknown) => { queue.fail(error) })
    for await (const chunk of queue) yield chunk
  }

  private async runNative(options: GenerateOptions, queue: StreamQueue<StreamChunk>): Promise<void> {
    let nextIndex = 0
    const controlBlocks = new Map<'planner' | 'reviewer', { index: number; text: string }>()
    const closeControl = (role: 'planner' | 'reviewer'): void => {
      const open = controlBlocks.get(role)
      if (open === undefined) return
      queue.push({ type: 'block-end', index: open.index, block: { type: 'reasoning', text: open.text } })
      controlBlocks.delete(role)
    }
    const closeAllControl = (): void => {
      for (const role of [...controlBlocks.keys()]) closeControl(role)
    }
    const observe = (event: CaptainControlEvent): void => {
      if (event.type === 'start') {
        closeControl(event.role)
        const index = nextIndex
        nextIndex += 1
        const text = event.role === 'planner' ? `GPT Planner · ${event.route.model}\n` : ''
        controlBlocks.set(event.role, { index, text })
        queue.push({ type: 'block-start', index, blockType: 'reasoning' })
        queue.push({ type: 'reasoning-delta', index, text })
        return
      }
      if (event.type === 'delta') {
        const open = controlBlocks.get(event.role)
        if (open === undefined) throw new Error(`Captain ${event.role} reasoning arrived without an open block`)
        open.text += event.text
        queue.push({ type: 'reasoning-delta', index: open.index, text: event.text })
        return
      }
      closeControl(event.role)
    }
    const emitReasoning = (text: string): void => {
      const index = nextIndex
      nextIndex += 1
      queue.push({ type: 'block-start', index, blockType: 'reasoning' })
      queue.push({ type: 'reasoning-delta', index, text })
      queue.push({ type: 'block-end', index, block: { type: 'reasoning', text } })
    }
    const emitText = (text: string): void => {
      const index = nextIndex
      nextIndex += 1
      queue.push({ type: 'block-start', index, blockType: 'text' })
      queue.push({ type: 'text-delta', index, text })
      queue.push({ type: 'block-end', index, block: { type: 'text', text } })
    }

    const key = options.sessionId === undefined ? undefined : String(options.sessionId)
    const continuation = latestUserSourceKind(options) === 'tool'
    let active = key === undefined ? undefined : this.activeRuns.get(key)
    try {
      if (continuation && active === undefined) {
        const recovered = this.orchestrator.recover(options)
        active = { turn: recovered, repairRounds: 0 }
        if (key !== undefined) this.activeRuns.set(key, active)
      } else if (!continuation) {
        if (key !== undefined) this.activeRuns.delete(key)
        const prepared = await this.orchestrator.prepare(options, observe)
        closeAllControl()
        if (prepared.kind === 'direct') {
          emitText(prepared.text)
          queue.push({ type: 'finish', reason: { kind: 'stop' } })
          return
        }
        active = { turn: prepared, repairRounds: 0 }
        if (key !== undefined) this.activeRuns.set(key, active)
        emitReasoning(`GPT Captain Plan\n${prepared.directive}`)
      }

      if (active === undefined) throw new Error('Captain native execution state was not initialized')

      for (;;) {
        const request = await this.orchestrator.workerRequest(options, active.turn, active.feedback)
        const worker = await forwardNativeStream(
          this.ctx.llm.stream(request),
          queue,
          () => nextIndex,
          (value) => { nextIndex = value },
        )
        if (worker.finish.kind === 'tool-calls' || worker.finish.kind === 'max-tokens') {
          queue.push({ type: 'finish', reason: worker.finish })
          return
        }
        if (worker.finish.kind === 'error' || worker.finish.kind === 'aborted') {
          if (key !== undefined) this.activeRuns.delete(key)
          queue.push({ type: 'finish', reason: worker.finish })
          return
        }
        if (!this.config().reviewerEnabled) {
          if (key !== undefined) this.activeRuns.delete(key)
          queue.push({ type: 'finish', reason: { kind: 'stop' } })
          return
        }

        const reviewed = await this.orchestrator.review(active.turn.plan, worker.text, options, observe)
        closeAllControl()
        if (reviewed.review.pass) {
          if (key !== undefined) this.activeRuns.delete(key)
          emitText(reviewSummary('Captain review passed.', reviewed.review.summary, reviewed.diff.changedFiles))
          queue.push({ type: 'finish', reason: { kind: 'stop' } })
          return
        }
        if (active.repairRounds >= this.orchestrator.maxRepairRounds()) {
          if (key !== undefined) this.activeRuns.delete(key)
          emitText(reviewSummary('Captain review stopped with findings.', findingsText(reviewed.review.findings), reviewed.diff.changedFiles))
          queue.push({ type: 'finish', reason: { kind: 'stop' } })
          return
        }
        active.repairRounds += 1
        active.feedback = [reviewed.review.summary, findingsText(reviewed.review.findings)].filter(Boolean).join('\n')
        emitReasoning(`GPT review requested repair ${active.repairRounds}/${this.orchestrator.maxRepairRounds()}\n${active.feedback}`)
      }
    } finally {
      closeAllControl()
    }
  }

  private async catalogModel(config: CaptainConfig): Promise<CaptainCatalogModel> {
    const [planner, worker] = await Promise.all([
      this.ctx.llm.listModels(config.planner.provider),
      this.ctx.llm.listModels(config.worker.provider),
    ])
    const plannerName = planner.find(item => item.id === config.planner.model)?.name ?? displayModelName(config.planner.model)
    const workerName = worker.find(item => item.id === config.worker.model)?.name ?? displayModelName(config.worker.model)
    const id = `captain:${config.planner.model}->${config.worker.model}`
    return {
      id,
      name: `${plannerName} -> ${workerName}`,
      description: config.reviewerEnabled
        ? 'GPT planner + native DeepSeek executor + GPT independent reviewer'
        : 'GPT planner + native DeepSeek executor',
      reasoningEfforts: [
        { id: ReasoningEffortId('balanced'), name: 'Balanced' },
        { id: ReasoningEffortId('high-quality'), name: 'High Quality' },
        { id: ReasoningEffortId('ultra'), name: 'Ultra' },
      ],
    }
  }
}

async function forwardNativeStream(
  stream: AsyncIterable<StreamChunk>,
  queue: StreamQueue<StreamChunk>,
  readNextIndex: () => number,
  writeNextIndex: (value: number) => void,
): Promise<{ text: string; finish: Extract<StreamChunk, { type: 'finish' }>['reason'] }> {
  const open = new Map<number, OpenBlock>()
  let text = ''
  let finish: Extract<StreamChunk, { type: 'finish' }>['reason'] | undefined
  const indexFor = (innerIndex: number, type?: ContentBlock['type']): OpenBlock => {
    const existing = open.get(innerIndex)
    if (existing !== undefined) return existing
    if (type === undefined) throw new Error(`DeepSeek emitted a delta for unopened block ${innerIndex}`)
    const outerIndex = readNextIndex()
    writeNextIndex(outerIndex + 1)
    const created: OpenBlock = { outerIndex, type, text: '', arguments: '' }
    open.set(innerIndex, created)
    return created
  }
  const closeIncomplete = (): void => {
    for (const [innerIndex, block] of open) {
      const completed = incompleteBlock(block)
      queue.push({ type: 'block-end', index: block.outerIndex, block: completed })
      open.delete(innerIndex)
    }
  }
  for await (const chunk of stream) {
    // Preserve provider accounting on the outer Captain stream. Dropping this
    // chunk makes the native worker's cache/input/output totals disappear from
    // the session token projection and StatsLine.
    if (chunk.type === 'usage') {
      queue.push(chunk)
      continue
    }
    if (chunk.type === 'finish') {
      closeIncomplete()
      finish = chunk.reason
      break
    }
    if (chunk.type === 'block-start') {
      const block = indexFor(chunk.index, chunk.blockType)
      queue.push({ type: 'block-start', index: block.outerIndex, blockType: chunk.blockType })
      continue
    }
    const block = indexFor(chunk.index)
    if (chunk.type === 'text-delta') {
      block.text += chunk.text
      text += chunk.text
      queue.push({ ...chunk, index: block.outerIndex })
    } else if (chunk.type === 'reasoning-delta') {
      block.text += chunk.text
      queue.push({ ...chunk, index: block.outerIndex })
    } else if (chunk.type === 'tool-call-delta') {
      block.id = String(chunk.id)
      if (chunk.name !== undefined) block.name = chunk.name
      block.arguments += chunk.argumentsDelta
      queue.push({ ...chunk, index: block.outerIndex })
    } else {
      if (chunk.block.type === 'text' && !text.endsWith(chunk.block.text)) text += chunk.block.text
      queue.push({ ...chunk, index: block.outerIndex })
      open.delete(chunk.index)
    }
  }
  if (finish === undefined) throw new Error('DeepSeek native stream ended without a finish chunk')
  return { text, finish }
}

function incompleteBlock(block: OpenBlock): ContentBlock {
  if (block.type === 'tool-call') {
    return {
      type: 'tool-call',
      id: block.id as never,
      name: block.name ?? '',
      arguments: block.arguments,
    }
  }
  if (block.type === 'reasoning') return { type: 'reasoning', text: block.text }
  return { type: 'text', text: block.text }
}

function latestUserSourceKind(options: GenerateOptions): string | undefined {
  for (let index = options.messages.length - 1; index >= 0; index -= 1) {
    const message = options.messages[index]
    if (message?.role === 'user') return message.source.kind
  }
  return undefined
}

function findingsText(findings: readonly CaptainFinding[]): string {
  return findings.map(finding => `- [${finding.severity}] ${finding.message}`).join('\n')
}

function reviewSummary(status: string, detail: string, files: readonly string[]): string {
  return [status, detail, `Incremental diff: ${files.join(', ') || 'none'}`].filter(Boolean).join('\n')
}

/** Give relay-only model ids a stable selector label when a catalog has no display name.
 * @param id - Model id to convert into a display label.
 * @returns Human-readable model name.
 */
export function displayModelName(id: string): string {
  const normalized = id.trim()
  const gpt = normalized.match(/^gpt-(.+)$/i)
  if (gpt !== null) return `GPT-${titleWords(gpt[1] ?? '')}`
  const deepseek = normalized.match(/^deepseek-(.+)$/i)
  if (deepseek !== null) return `DeepSeek ${titleWords(deepseek[1] ?? '')}`
  return titleWords(normalized)
}

function titleWords(value: string): string {
  return value.split(/[-_\s]+/).filter(Boolean).map((word) => {
    if (/^v\d/i.test(word)) return `V${word.slice(1)}`
    return word.charAt(0).toUpperCase() + word.slice(1)
  }).join(' ')
}
