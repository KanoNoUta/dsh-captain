import type { CaptainConfig, CaptainPolicy, CaptainRoleRoute } from './types.ts';
/** Resolve a display policy to the three role effort values. */
export declare function effortPreset(policy: CaptainPolicy): Record<'planner' | 'worker' | 'reviewer', string>;
/** Select the strongest supported provider effort for a Captain policy value. */
export declare function compatibleReasoningEffort(requested: string, supported: readonly string[]): string | undefined;
/** Apply a policy only where a role did not explicitly choose its effort. */
export declare function resolvedRoleRoutes(config: CaptainConfig): Record<'planner' | 'worker' | 'reviewer', CaptainRoleRoute>;
//# sourceMappingURL=presets.d.ts.map