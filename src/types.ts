import type { ReasoningEffortId, StreamChunk } from '@deepseek-ai/dsh-llm'

/** One model route used by a Captain role. */
export interface CaptainRoleRoute {
  /** Provider id used for this role. */
  provider: string
  /** Model id used for this role. */
  model: string
  /** Explicit reasoning effort, or an empty string for automatic selection. */
  reasoningEffort: string
}

/** User-selectable orchestration policy. */
export type CaptainPolicy = 'balanced' | 'high-quality' | 'ultra'

/** Adaptive scheduler settings. */
export interface CaptainOrchestrationConfig {
  /** Whether concurrency is selected automatically or fixed by the limits. */
  mode: 'auto' | 'fixed'
  /** Minimum number of agents retained by adaptive scheduling. */
  minAgents: number
  /** Maximum number of planned agents. */
  maxAgents: number
  /** Maximum simultaneous worker runs; zero uses the agent limit. */
  maxParallel: number
  /** Total worker token budget for one Captain turn. */
  totalTokenBudget: number
  /** Token budget reserved for the reviewer. */
  reviewerTokenBudget: number
  /** Maximum repair loops after a failed review. */
  maxRepairRounds: number
  /** Whether provider pressure changes the parallel limit. */
  adaptiveConcurrency: boolean
}

/** Bounded read-only repository evidence supplied to the GPT planner. */
export interface CaptainRepositoryContext {
  /** Parent Agent workspace used for the read-only scan. */
  cwd: string
  /** Stable workspace-relative paths discovered during traversal. */
  tree: readonly string[]
  /** Source excerpts selected for the current task. */
  excerpts: readonly { path: string; text: string }[]
  /** Files omitted because of type, directory, read, or byte limits. */
  omitted: readonly string[]
}

/** Read-only repository capability used by the GPT planning control plane. */
export interface CaptainRepositoryReader {
  /** Inspect one parent workspace without mutating it. */
  inspect(task: string, cwd: string, signal?: AbortSignal): Promise<CaptainRepositoryContext | undefined>
}

/** Complete Captain settings section. */
export interface CaptainConfig {
  /** Fallback route used when a role route is incomplete. */
  default: CaptainRoleRoute
  /** GPT route that creates the implementation plan. */
  planner: CaptainRoleRoute
  /** DeepSeek route that executes the plan through native tools. */
  worker: CaptainRoleRoute
  /** GPT route that reviews the incremental diff. */
  reviewer: CaptainRoleRoute
  /** Image-capable route used for vision requests. */
  vision: CaptainRoleRoute
  /** Whether to review the completed worker output and run repair passes. */
  reviewerEnabled: boolean
  /** Named thinking policy used when role effort is not explicit. */
  policy: CaptainPolicy
  /** Agent count, concurrency, and token budget controls. */
  orchestration: CaptainOrchestrationConfig
}

/** One planner-produced unit of work. */
export interface CaptainTask {
  id: string
  prompt: string
  dependsOn: string[]
  files: string[]
  tokenBudget: number
}

/** Planner result. */
export interface CaptainPlan {
  tasks: CaptainTask[]
  acceptance: string[]
}

/** Worker output passed to the reviewer. */
export interface CaptainWorkerResult {
  taskId: string
  ok: boolean
  output: string
  changedFiles: string[]
  tokens: number
  error?: string
}

/** A targeted reviewer finding. */
export interface CaptainFinding {
  id: string
  message: string
  taskId?: string
  files: string[]
  severity: 'error' | 'warning' | 'info'
}

/** Structured reviewer output. */
export interface CaptainReview {
  pass: boolean
  summary: string
  findings: CaptainFinding[]
}

/** Git incremental checkpoint. */
export interface CaptainCheckpoint {
  head: string
  diffHash: string
  changedFiles: string[]
  createdAt: number
}

/** Captured text stream from one nested model call. */
export interface CaptainTextResult {
  text: string
  chunks: StreamChunk[]
  outputTokens?: number
}

/** A route plus its live display metadata for the model directory. */
export interface CaptainCatalogModel {
  id: string
  name: string
  description: string
  reasoningEfforts: readonly { id: ReasoningEffortId; name: string; description?: string }[]
}
