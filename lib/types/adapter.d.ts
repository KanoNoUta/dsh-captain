import type { Context } from '@deepseek-ai/cordis';
import { LlmAdapter } from '@deepseek-ai/dsh-llm';
import type { GenerateOptions, LlmModelInfo, LlmProviderInfo, LlmResolvedModelInfo, StreamChunk } from '@deepseek-ai/dsh-llm';
import type { CaptainConfig } from './types.ts';
/** Synthetic provider id shown as the native model-directory group. */
export declare const CAPTAIN_PROVIDER = "captain";
/** Adapter that turns one Captain selection into a planner/worker/reviewer run. */
export declare class CaptainAdapter extends LlmAdapter {
    private readonly ctx;
    private readonly config;
    private readonly orchestrator;
    constructor(ctx: Context, config: () => CaptainConfig);
    providerInfo(provider: string): LlmProviderInfo;
    listModels(provider: string): Promise<readonly LlmModelInfo[]>;
    resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo>;
    stream(options: GenerateOptions): AsyncIterable<StreamChunk>;
    private catalogModel;
}
/** Give relay-only model ids a stable selector label when a catalog has no display name. */
export declare function displayModelName(id: string): string;
//# sourceMappingURL=adapter.d.ts.map