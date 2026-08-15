import type { CaptainReview, CaptainTask, CaptainWorkerResult } from './types.ts';
/** Parse a reviewer response without trusting provider prose as control data.
 * @param raw - Untrusted reviewer response text.
 * @returns Structured review with a protocol finding on malformed input.
 */
export declare function parseReview(raw: string): CaptainReview;
/**
 * Whether one malformed provider response merits the single protocol correction retry.
 * @param review - Parsed review or parser-generated protocol finding.
 * @returns True for a reviewer format failure.
 */
export declare function reviewNeedsRetry(review: CaptainReview): boolean;
/** Select only tasks touched by reviewer findings; an unscoped finding rechecks every task.
 * @param tasks - Planner task list.
 * @param review - Parsed reviewer result.
 * @returns Tasks that should be retried, including their dependencies.
 */
export declare function repairTasks(tasks: readonly CaptainTask[], review: CaptainReview): CaptainTask[];
/** Render the compact review payload sent to GPT.
 * @param acceptance - Acceptance criteria from the planner.
 * @param workers - Outputs from completed worker tasks.
 * @param patch - Incremental git diff under review.
 * @returns Review prompt with a JSON-only response requirement.
 */
export declare function reviewPrompt(acceptance: readonly string[], workers: readonly CaptainWorkerResult[], patch: string): string;
//# sourceMappingURL=reviewer.d.ts.map