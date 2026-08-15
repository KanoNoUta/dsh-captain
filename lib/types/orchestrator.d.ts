import type { Context } from '@deepseek-ai/cordis';
import { type GenerateOptions, type LlmModelInfo, type LlmResolvedModelInfo, type Message } from '@deepseek-ai/dsh-llm';
import type { StreamChunk } from '@deepseek-ai/dsh-llm';
import type { SessionId } from '@deepseek-ai/dsh-session';
import type { CaptainConfig, CaptainPlan, CaptainReview, CaptainRepositoryReader, CaptainRoleRoute, CaptainTextResult } from './types.ts';
import { type IncrementalDiff } from './diff.ts';
/** LLM call facade kept small so the orchestrator is deterministic in tests. */
export interface CaptainCall {
    /** Stream one provider-neutral model request. */
    stream(options: GenerateOptions): AsyncIterable<StreamChunk>;
    /** List one provider's catalog when vision routing needs capability metadata. */
    listModels?: (provider: string) => Promise<readonly LlmModelInfo[]>;
    /** Resolve exact-model metadata before selecting a compatible effort. */
    resolveModelInfo?: (provider: string, model: string) => Promise<LlmResolvedModelInfo>;
}
/** GPT control-plane progress exposed to the synthetic outer stream. */
export type CaptainControlEvent = {
    type: 'start';
    role: 'planner' | 'reviewer';
    route: CaptainRoleRoute;
} | {
    type: 'delta';
    role: 'planner' | 'reviewer';
    text: string;
} | {
    type: 'end';
    role: 'planner' | 'reviewer';
    route: CaptainRoleRoute;
};
/** Receive one GPT planner or reviewer lifecycle fact for the active Captain request. */
export type CaptainControlObserver = (event: CaptainControlEvent) => void;
/** A direct GPT response that bypasses repository execution. */
export interface CaptainDirectTurn {
    kind: 'direct';
    text: string;
}
/** A GPT plan converted into instructions for the parent Agent's native DeepSeek loop. */
export interface CaptainExecutionTurn {
    kind: 'execution';
    plan: CaptainPlan;
    directive: string;
}
/** Result of the independent incremental-diff review. */
export interface CaptainReviewResult {
    review: CaptainReview;
    diff: IncrementalDiff & {
        available: boolean;
    };
}
/** Host control plane for GPT planning, native DeepSeek execution, and GPT review. */
export declare class CaptainOrchestrator {
    private readonly ctx;
    private readonly config;
    private readonly llm;
    private readonly repository?;
    private checkpoint;
    private checkpointCwd;
    constructor(ctx: Context, config: () => CaptainConfig, llm: CaptainCall, repository?: CaptainRepositoryReader | undefined);
    /**
     * Prepare a new direct-user turn without starting a hidden worker Session.
     * @param options - Parent Agent model request.
     * @param observe - Optional GPT reasoning observer.
     * @returns A direct answer or the plan handed to the native DeepSeek loop.
     */
    prepare(options: GenerateOptions, observe?: CaptainControlObserver): Promise<CaptainDirectTurn | CaptainExecutionTurn>;
    /**
     * Reconstruct a minimal execution turn after a Host restart without asking GPT to plan a tool-result continuation again.
     * @param options - Parent request whose history still contains the direct user task.
     * @returns A single-task native execution plan.
     */
    recover(options: GenerateOptions): CaptainExecutionTurn;
    /**
     * Build the DeepSeek request that runs inside the parent Agent's native tool loop.
     * @param options - Original parent request including system prompt, tools, history, and cancellation.
     * @param turn - GPT plan for this user turn.
     * @param feedback - Optional independent-review findings for a repair pass.
     * @returns A worker-routed request preserving every parent execution capability.
     */
    workerRequest(options: GenerateOptions, turn: CaptainExecutionTurn, feedback?: string): Promise<GenerateOptions>;
    /**
     * Review one completed native DeepSeek pass against the current incremental Git diff.
     * @param plan - GPT plan whose acceptance criteria govern the review.
     * @param workerOutput - Visible final text from the native DeepSeek pass.
     * @param options - Parent request providing session identity and cancellation.
     * @param observe - Optional reviewer reasoning observer.
     * @returns Structured review plus the reviewed diff metadata.
     */
    review(plan: CaptainPlan, workerOutput: string, options: GenerateOptions, observe?: CaptainControlObserver): Promise<CaptainReviewResult>;
    /** Return the configured maximum number of repair passes for one task turn.
     * @returns Maximum repair passes configured for the current Captain run.
     */
    maxRepairRounds(): number;
    private taskInput;
    private call;
    private reasoningOptions;
    private readDiff;
}
/**
 * Resolve the repository working directory carried by the parent Agent session.
 * @param ctx - Host context containing the live Agent registry.
 * @param sessionId - Parent Agent identity from the model request.
 * @returns The session workspace path, or undefined without a live parent workspace.
 */
export declare function workspaceCwdFor(ctx: Context, sessionId: SessionId | undefined): string | undefined;
/** Collect visible text and usage from a canonical stream.
 * @param stream - Canonical model stream to consume.
 * @param observe - Optional callback for each received chunk.
 * @returns Collected visible text, chunks, and output token usage.
 */
export declare function collectText(stream: AsyncIterable<StreamChunk>, observe?: (chunk: StreamChunk) => void): Promise<CaptainTextResult>;
/** Identify short social turns that should not start a repository-changing run.
 * @param task - Normalized user task text.
 * @returns True when the task is a short conversational greeting or thanks.
 */
export declare function isConversationalTask(task: string): boolean;
/** Whether a short image turn asks only for visual facts rather than repository work.
 * @param task - Normalized user task text.
 * @returns True when the task requests image facts without implementation work.
 */
export declare function isImageAnalysisTask(task: string): boolean;
/**
 * Return text from the latest direct user message, excluding tool results and injected context.
 * @param messages - Complete model request history.
 * @returns Text blocks from the latest direct user message, or an empty string when absent.
 */
export declare function currentTaskText(messages: readonly Message[]): string;
//# sourceMappingURL=orchestrator.d.ts.map