import type { Context } from '@deepseek-ai/cordis'
import { LlmAdapter, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, LlmModelInfo, LlmProviderInfo, LlmResolvedModelInfo, StreamChunk } from '@deepseek-ai/dsh-llm'
import type { CaptainConfig, CaptainCatalogModel } from './types.ts'
import { CaptainOrchestrator } from './orchestrator.ts'

/** Synthetic provider id shown as the native model-directory group. */
export const CAPTAIN_PROVIDER = 'captain'

/** Adapter that turns one Captain selection into a planner/worker/reviewer run. */
export class CaptainAdapter extends LlmAdapter {
  private readonly orchestrator: CaptainOrchestrator

  constructor(private readonly ctx: Context, private readonly config: () => CaptainConfig) {
    super()
    this.orchestrator = new CaptainOrchestrator(ctx, config, ctx.llm)
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
    const text = await this.orchestrator.run(options)
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text }
    yield { type: 'block-end', index: 0, block: { type: 'text', text } }
    yield { type: 'finish', reason: { kind: 'stop' } }
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
        ? 'GPT planner + DeepSeek worker + GPT independent reviewer'
        : 'GPT planner + DeepSeek worker + DeepSeek worker review',
      reasoningEfforts: [
        { id: ReasoningEffortId('balanced'), name: 'Balanced' },
        { id: ReasoningEffortId('high-quality'), name: 'High Quality' },
        { id: ReasoningEffortId('ultra'), name: 'Ultra' },
      ],
    }
  }
}

/** Give relay-only model ids a stable selector label when a catalog has no display name. */
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
