import type { CaptainConfig, CaptainPolicy, CaptainRoleRoute } from './types.ts';
/** Resolve a display policy to the three role effort values.
 * @param policy - Named Captain thinking policy.
 * @returns Effort value for planner, worker, and reviewer roles.
 */
export declare function effortPreset(policy: CaptainPolicy): Record<'planner' | 'worker' | 'reviewer', string>;
/** Select the strongest supported provider effort for a Captain policy value.
 * @param requested - Desired effort from the Captain policy.
 * @param supported - Efforts advertised by the selected model.
 * @returns Best compatible effort, or undefined when none is available.
 */
export declare function compatibleReasoningEffort(requested: string, supported: readonly string[]): string | undefined;
/** Apply a policy only where a role did not explicitly choose its effort.
 * @param config - Captain route and policy settings.
 * @returns Resolved planner, worker, and reviewer routes.
 */
export declare function resolvedRoleRoutes(config: CaptainConfig): Record<'planner' | 'worker' | 'reviewer', CaptainRoleRoute>;
//# sourceMappingURL=presets.d.ts.map