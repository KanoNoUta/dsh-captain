import type { Context } from '@deepseek-ai/cordis';
import { type GenerateOptions, type LlmModelInfo, type LlmResolvedModelInfo, type Message } from '@deepseek-ai/dsh-llm';
import type { StreamChunk } from '@deepseek-ai/dsh-llm';
import type { CaptainConfig, CaptainTextResult } from './types.ts';
/** LLM call facade kept small so the orchestrator is deterministic in tests. */
export interface CaptainCall {
    stream(options: GenerateOptions): AsyncIterable<StreamChunk>;
    listModels?: (provider: string) => Promise<readonly LlmModelInfo[]>;
    resolveModelInfo?: (provider: string, model: string) => Promise<LlmResolvedModelInfo>;
}
/** Host orchestrator for one synthetic Captain request. */
export declare class CaptainOrchestrator {
    private readonly ctx;
    private readonly config;
    private readonly llm;
    private checkpoint;
    constructor(ctx: Context, config: () => CaptainConfig, llm: CaptainCall);
    /** Plan, execute, review, and return a user-facing summary. */
    run(options: GenerateOptions): Promise<string>;
    private executeTasks;
    private worker;
    private review;
    private taskInput;
    private call;
    /** Keep Captain policy labels compatible with the selected provider model. */
    private reasoningOptions;
    private readDiff;
    private changedFiles;
}
/** Collect visible text and usage from a canonical stream. */
export declare function collectText(stream: AsyncIterable<StreamChunk>): Promise<CaptainTextResult>;
/** Identify short social turns that should not start a repository-changing run. */
export declare function isConversationalTask(task: string): boolean;
/** Whether a short image turn asks only for visual facts rather than repository work. */
export declare function isImageAnalysisTask(task: string): boolean;
/**
 * Return text from the latest direct user message, excluding history and injected context.
 * @param messages - Complete model request history.
 * @returns Text blocks from the latest direct user message, or an empty string when absent.
 */
export declare function currentTaskText(messages: readonly Message[]): string;
//# sourceMappingURL=orchestrator.d.ts.map