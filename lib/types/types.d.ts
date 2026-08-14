import type { ReasoningEffortId, StreamChunk } from '@deepseek-ai/dsh-llm';
/** One model route used by a Captain role. */
export interface CaptainRoleRoute {
    provider: string;
    model: string;
    reasoningEffort: string;
}
/** User-selectable orchestration policy. */
export type CaptainPolicy = 'balanced' | 'high-quality' | 'ultra';
/** Adaptive scheduler settings. */
export interface CaptainOrchestrationConfig {
    mode: 'auto' | 'fixed';
    minAgents: number;
    maxAgents: number;
    maxParallel: number;
    totalTokenBudget: number;
    reviewerTokenBudget: number;
    maxRepairRounds: number;
    adaptiveConcurrency: boolean;
}
/** Complete Captain settings section. */
export interface CaptainConfig {
    default: CaptainRoleRoute;
    planner: CaptainRoleRoute;
    worker: CaptainRoleRoute;
    reviewer: CaptainRoleRoute;
    vision: CaptainRoleRoute;
    /** Use the dedicated GPT reviewer route; when false, the worker route reviews. */
    reviewerEnabled: boolean;
    policy: CaptainPolicy;
    orchestration: CaptainOrchestrationConfig;
}
/** One planner-produced unit of work. */
export interface CaptainTask {
    id: string;
    prompt: string;
    dependsOn: string[];
    files: string[];
    tokenBudget: number;
}
/** Planner result. */
export interface CaptainPlan {
    tasks: CaptainTask[];
    acceptance: string[];
}
/** Worker output passed to the reviewer. */
export interface CaptainWorkerResult {
    taskId: string;
    ok: boolean;
    output: string;
    changedFiles: string[];
    tokens: number;
    error?: string;
}
/** A targeted reviewer finding. */
export interface CaptainFinding {
    id: string;
    message: string;
    taskId?: string;
    files: string[];
    severity: 'error' | 'warning' | 'info';
}
/** Structured reviewer output. */
export interface CaptainReview {
    pass: boolean;
    summary: string;
    findings: CaptainFinding[];
}
/** Git incremental checkpoint. */
export interface CaptainCheckpoint {
    head: string;
    diffHash: string;
    changedFiles: string[];
    createdAt: number;
}
/** Captured text stream from one nested model call. */
export interface CaptainTextResult {
    text: string;
    chunks: StreamChunk[];
    outputTokens?: number;
}
/** A route plus its live display metadata for the model directory. */
export interface CaptainCatalogModel {
    id: string;
    name: string;
    description: string;
    reasoningEfforts: readonly {
        id: ReasoningEffortId;
        name: string;
        description?: string;
    }[];
}
//# sourceMappingURL=types.d.ts.map