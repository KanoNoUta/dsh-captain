import type { CaptainCheckpoint } from './types.ts';
/** Minimal Git runner required by the incremental review projection. */
export interface GitReader {
    run(args: readonly string[]): Promise<string>;
}
/** Result of comparing the workspace to a previous checkpoint. */
export interface IncrementalDiff {
    head: string;
    patch: string;
    changedFiles: string[];
    hash: string;
}
/** Compute a stable FNV-1a hash without a crypto dependency in the browser-safe projection.
 * @param value - Text to hash.
 * @returns Eight-digit hexadecimal hash.
 */
export declare function diffHash(value: string): string;
/** Read changes after the checkpoint's recorded HEAD, including staged and working-tree edits.
 * @param git - Git command runner.
 * @param checkpoint - Previous reviewer checkpoint, if any.
 * @returns Current HEAD, patch, changed files, and patch hash.
 */
export declare function incrementalDiff(git: GitReader, checkpoint?: CaptainCheckpoint): Promise<IncrementalDiff>;
/** Advance the checkpoint only after a reviewer pass.
 * @param diff - Reviewed incremental diff.
 * @param now - Timestamp to record in the checkpoint.
 * @returns New checkpoint covering the reviewed diff.
 */
export declare function advanceCheckpoint(diff: IncrementalDiff, now?: number): CaptainCheckpoint;
//# sourceMappingURL=diff.d.ts.map