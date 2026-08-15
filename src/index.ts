/** Captain Host half: GPT planning, DeepSeek execution, GPT review. */
import type { Context } from '@deepseek-ai/cordis'
// Type-only imports make the Host Context merges visible to aggregate builds.
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-fs'
import type {} from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-settings'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import type { LlmConfigurableProvider } from '@deepseek-ai/dsh-llm'
import { CaptainAdapter, CAPTAIN_PROVIDER } from './adapter.ts'
import { CAPTAIN_SETTINGS_NAMESPACE, Config } from './config.ts'
import type { CaptainConfig } from './types.ts'

export { CaptainAdapter, CAPTAIN_PROVIDER } from './adapter.ts'
export { CAPTAIN_SETTINGS_NAMESPACE, Config, DEFAULT_CAPTAIN_CONFIG } from './config.ts'
export type * from './types.ts'
export { effortPreset, resolvedRoleRoutes } from './presets.ts'
export { createSchedulerState, finishTask, isSettled, readyTasks, settleBlockedTasks, startTask, validateTasks } from './scheduler.ts'
export { advanceCheckpoint, diffHash, incrementalDiff } from './diff.ts'
export { parseReview, repairTasks, reviewNeedsRetry, reviewPrompt } from './reviewer.ts'
export { withImages, visionRequest } from './vision.ts'

export const name = 'captain'
export const inject = ['llm', 'settings', 'agents', 'fs']
const NS = settingsNamespace(CAPTAIN_SETTINGS_NAMESPACE)

/** Mount Captain's synthetic provider and hot-reloadable settings section. */
export function apply(ctx: Context, config: CaptainConfig): void {
  let current: () => CaptainConfig = () => config
  const adapter = new CaptainAdapter(ctx, () => current())
  ctx.llm.registerAdapter([CAPTAIN_PROVIDER], adapter)
  const configurable: LlmConfigurableProvider = {
    provider: CAPTAIN_PROVIDER,
    displayName: 'Captain / 船长',
    settingsNs: NS,
    settingsPath: [],
    declared: true,
  }
  ctx.llm.registerConfigurableProviders([configurable])
  installSettingsSection(ctx, NS, Config, config, {
    setSource: (source) => { current = source },
    onChange: () => { /* adapter reads the current source per request */ },
  })
}
