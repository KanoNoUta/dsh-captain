import z from '@deepseek-ai/schemastery'
import type { CaptainConfig } from './types.ts'

const roleRoute = z.object({
  provider: z.string().required(),
  model: z.string().required(),
  reasoningEffort: z.string().default(''),
})

export const DEFAULT_CAPTAIN_CONFIG: CaptainConfig = {
  default: { provider: 'gpt-relay', model: 'gpt-5.6-terra', reasoningEffort: '' },
  planner: { provider: 'gpt-relay', model: 'gpt-5.6-sol', reasoningEffort: '' },
  worker: { provider: 'deepseek-official', model: 'deepseek-v4-flash', reasoningEffort: '' },
  reviewer: { provider: 'gpt-relay', model: 'gpt-5.6-terra', reasoningEffort: '' },
  vision: { provider: 'gpt-relay', model: 'gpt-5.6-terra', reasoningEffort: 'high' },
  reviewerEnabled: true,
  policy: 'ultra',
  orchestration: {
    mode: 'auto', minAgents: 1, maxAgents: 16, maxParallel: 0,
    totalTokenBudget: 120000, reviewerTokenBudget: 30000, maxRepairRounds: 3,
    adaptiveConcurrency: true,
  },
}

export const Config: z<CaptainConfig> = z.object({
  default: roleRoute.default(DEFAULT_CAPTAIN_CONFIG.default),
  planner: roleRoute.default(DEFAULT_CAPTAIN_CONFIG.planner),
  worker: roleRoute.default(DEFAULT_CAPTAIN_CONFIG.worker),
  reviewer: roleRoute.default(DEFAULT_CAPTAIN_CONFIG.reviewer),
  vision: roleRoute.default(DEFAULT_CAPTAIN_CONFIG.vision),
  reviewerEnabled: z.boolean().default(DEFAULT_CAPTAIN_CONFIG.reviewerEnabled),
  policy: z.union(['balanced', 'high-quality', 'ultra']).default(DEFAULT_CAPTAIN_CONFIG.policy),
  orchestration: z.object({
    mode: z.union(['auto', 'fixed']).default('auto'),
    minAgents: z.number().step(1).min(1).max(128).default(1),
    maxAgents: z.number().step(1).min(1).max(128).default(16),
    maxParallel: z.number().step(1).min(0).max(128).default(0),
    totalTokenBudget: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(120000),
    reviewerTokenBudget: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(30000),
    maxRepairRounds: z.number().step(1).min(0).max(20).default(3),
    adaptiveConcurrency: z.boolean().default(true),
  }).default(DEFAULT_CAPTAIN_CONFIG.orchestration),
})

/** The settings namespace used by the Host and browser halves. */
export const CAPTAIN_SETTINGS_NAMESPACE = 'captain'
