import type { CaptainConfig, CaptainPolicy, CaptainRoleRoute } from './types.ts'

/** Resolve a display policy to the three role effort values. */
export function effortPreset(policy: CaptainPolicy): Record<'planner' | 'worker' | 'reviewer', string> {
  switch (policy) {
    case 'balanced': return { planner: 'high', worker: 'high', reviewer: 'high' }
    case 'high-quality': return { planner: 'max', worker: 'high', reviewer: 'max' }
    case 'ultra': return { planner: 'ultra', worker: 'ultra', reviewer: 'ultra' }
  }
}

/** Select the strongest supported provider effort for a Captain policy value. */
export function compatibleReasoningEffort(requested: string, supported: readonly string[]): string | undefined {
  if (supported.length === 0) return undefined
  const candidates = requested === 'ultra'
    ? [requested, 'max', 'high', 'medium', 'low', 'off']
    : requested === 'max'
      ? [requested, 'high', 'medium', 'low', 'off']
      : requested === 'high'
        ? [requested, 'medium', 'low', 'off']
        : [requested, 'off']
  return candidates.find(candidate => supported.includes(candidate))
}

/** Apply a policy only where a role did not explicitly choose its effort. */
export function resolvedRoleRoutes(config: CaptainConfig): Record<'planner' | 'worker' | 'reviewer', CaptainRoleRoute> {
  const preset = effortPreset(config.policy)
  const fallback = config.default
  const route = (candidate: CaptainRoleRoute, effort: string): CaptainRoleRoute => ({
    provider: candidate.provider || fallback.provider,
    model: candidate.model || fallback.model,
    reasoningEffort: candidate.reasoningEffort || fallback.reasoningEffort || effort,
  })
  return {
    planner: route(config.planner, preset.planner),
    worker: route(config.worker, preset.worker),
    reviewer: route(config.reviewer, preset.reviewer),
  }
}
