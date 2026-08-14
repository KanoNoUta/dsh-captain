/** Captain Host half: GPT planning, DeepSeek execution, GPT review. */
import type { Context } from '@deepseek-ai/cordis';
import type { CaptainConfig } from './types.ts';
export { CaptainAdapter, CAPTAIN_PROVIDER } from './adapter.ts';
export { CAPTAIN_SETTINGS_NAMESPACE, Config, DEFAULT_CAPTAIN_CONFIG } from './config.ts';
export type * from './types.ts';
export { effortPreset, resolvedRoleRoutes } from './presets.ts';
export { createSchedulerState, finishTask, isSettled, readyTasks, settleBlockedTasks, startTask, validateTasks } from './scheduler.ts';
export { advanceCheckpoint, diffHash, incrementalDiff } from './diff.ts';
export { parseReview, repairTasks, reviewPrompt } from './reviewer.ts';
export { withImages, visionRequest } from './vision.ts';
export declare const name = "captain";
export declare const inject: string[];
/** Mount Captain's synthetic provider and hot-reloadable settings section. */
export declare function apply(ctx: Context, config: CaptainConfig): void;
//# sourceMappingURL=index.d.ts.map