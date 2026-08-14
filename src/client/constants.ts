import type { CaptainConfig } from '../types.ts'

/** Browser-safe settings namespace and defaults; no Host schema imports. */
export const CAPTAIN_SETTINGS_NAMESPACE = 'captain'
export const DEFAULT_CAPTAIN_CONFIG: CaptainConfig = {
  default: { provider: 'gpt-relay', model: 'gpt-5.6-terra', reasoningEffort: '' },
  planner: { provider: 'gpt-relay', model: 'gpt-5.6-sol', reasoningEffort: '' },
  worker: { provider: 'deepseek-official', model: 'deepseek-v4-flash', reasoningEffort: '' },
  reviewer: { provider: 'gpt-relay', model: 'gpt-5.6-terra', reasoningEffort: '' },
  vision: { provider: 'gpt-relay', model: 'gpt-5.6-terra', reasoningEffort: '' },
  reviewerEnabled: true,
  policy: 'ultra',
  orchestration: { mode: 'auto', minAgents: 1, maxAgents: 16, maxParallel: 0, totalTokenBudget: 120000, reviewerTokenBudget: 30000, maxRepairRounds: 3, adaptiveConcurrency: true },
}
