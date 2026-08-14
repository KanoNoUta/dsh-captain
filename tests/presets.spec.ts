import { describe, expect, it } from 'vitest'
import { compatibleReasoningEffort, effortPreset, resolvedRoleRoutes } from '../src/presets.ts'
import { displayModelName } from '../src/adapter.ts'
import type { CaptainConfig } from '../src/types.ts'

const config = (policy: CaptainConfig['policy'], effort = ''): CaptainConfig => ({
  default: { provider: 'gpt', model: 'terra', reasoningEffort: effort },
  planner: { provider: 'gpt', model: 'sol', reasoningEffort: effort },
  worker: { provider: 'ds', model: 'flash', reasoningEffort: effort },
  reviewer: { provider: 'gpt', model: 'terra', reasoningEffort: effort },
  vision: { provider: 'gpt', model: 'terra', reasoningEffort: effort },
  reviewerEnabled: true,
  policy,
  orchestration: { mode: 'auto', minAgents: 1, maxAgents: 4, maxParallel: 0, totalTokenBudget: 100, reviewerTokenBudget: 20, maxRepairRounds: 1, adaptiveConcurrency: true },
})

describe('Captain effort policies', () => {
  it('maps the three policies to role efforts', () => {
    expect(effortPreset('balanced')).toEqual({ planner: 'high', worker: 'high', reviewer: 'high' })
    expect(effortPreset('high-quality')).toEqual({ planner: 'max', worker: 'high', reviewer: 'max' })
    expect(effortPreset('ultra')).toEqual({ planner: 'ultra', worker: 'ultra', reviewer: 'ultra' })
  })

  it('keeps explicit route effort above the policy default', () => {
    expect(resolvedRoleRoutes(config('balanced', 'custom')).planner.reasoningEffort).toBe('custom')
    expect(resolvedRoleRoutes(config('high-quality')).reviewer.reasoningEffort).toBe('max')
  })

  it('formats relay ids when a provider catalog has no display label', () => {
    expect(displayModelName('gpt-5.6-sol')).toBe('GPT-5.6 Sol')
    expect(displayModelName('deepseek-v4-flash')).toBe('DeepSeek V4 Flash')
  })

  it('maps Captain effort labels to the strongest supported provider effort', () => {
    expect(compatibleReasoningEffort('ultra', ['high', 'max'])).toBe('max')
    expect(compatibleReasoningEffort('max', ['high'])).toBe('high')
    expect(compatibleReasoningEffort('high', ['off'])).toBe('off')
    expect(compatibleReasoningEffort('ultra', [])).toBeUndefined()
  })

  it('uses the default route when a role is left blank', () => {
    const value = config('balanced')
    value.planner = { provider: '', model: '', reasoningEffort: '' }
    expect(resolvedRoleRoutes(value).planner).toEqual({ provider: 'gpt', model: 'terra', reasoningEffort: 'high' })
  })
})
