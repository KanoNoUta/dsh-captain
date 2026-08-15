import type { CaptainReview, CaptainTask, CaptainWorkerResult } from './types.ts';
/** Parse a reviewer response without trusting provider prose as control data. */
export declare function parseReview(raw: string): CaptainReview;
/** Whether one malformed provider response merits the single protocol correction retry. */
export declare function reviewNeedsRetry(review: CaptainReview): boolean;
/** Select only tasks touched by reviewer findings; an unscoped finding rechecks every task. */
export declare function repairTasks(tasks: readonly CaptainTask[], review: CaptainReview): CaptainTask[];
/** Render the compact review payload sent to GPT. */
export declare function reviewPrompt(acceptance: readonly string[], workers: readonly CaptainWorkerResult[], patch: string): string;
//# sourceMappingURL=reviewer.d.ts.map