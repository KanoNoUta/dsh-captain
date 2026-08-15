import type { Context } from '@deepseek-ai/cordis';
import { LlmAdapter } from '@deepseek-ai/dsh-llm';
import type { GenerateOptions, LlmModelInfo, LlmProviderInfo, LlmResolvedModelInfo, StreamChunk } from '@deepseek-ai/dsh-llm';
import type { CaptainConfig, CaptainRepositoryReader } from './types.ts';
/** Synthetic provider id shown as the native model-directory group. */
export declare const CAPTAIN_PROVIDER = "captain";
/** Adapter that keeps GPT on the control plane while DeepSeek uses the parent Agent's native tool loop. */
export declare class CaptainAdapter extends LlmAdapter {
    private readonly ctx;
    private readonly config;
    private readonly orchestrator;
    private readonly activeRuns;
    constructor(ctx: Context, config: () => CaptainConfig, repository?: CaptainRepositoryReader);
    providerInfo(provider: string): LlmProviderInfo;
    listModels(provider: string): Promise<readonly LlmModelInfo[]>;
    resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo>;
    stream(options: GenerateOptions): AsyncIterable<StreamChunk>;
    private runNative;
    private catalogModel;
}
/** Give relay-only model ids a stable selector label when a catalog has no display name.
 * @param id - Model id to convert into a display label.
 * @returns Human-readable model name.
 */
export declare function displayModelName(id: string): string;
//# sourceMappingURL=adapter.d.ts.map