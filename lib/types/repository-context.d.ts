import type { FileSystem, FsTarget } from '@deepseek-ai/dsh-fs';
import type { CaptainRepositoryContext, CaptainRepositoryReader } from './types.ts';
/** Fixed complete-result bounds for one planner repository scan. */
export declare const REPOSITORY_CONTEXT_LIMITS: {
    readonly maxFiles: 48;
    readonly maxFileBytes: 24000;
    readonly maxTotalBytes: 120000;
    readonly maxTreeEntries: 256;
    readonly maxDepth: 6;
};
/** Limits used by the pure candidate-selection helper. */
export interface RepositoryContextLimits {
    maxFiles: number;
    maxFileBytes: number;
    maxTotalBytes: number;
}
/** A regular file discovered under the parent workspace. */
export interface RepositoryFileCandidate {
    path: string;
    size?: number;
    target: FsTarget;
}
/** Filesystem-backed read-only repository context provider. */
export declare class FileSystemRepositoryReader implements CaptainRepositoryReader {
    private readonly fs;
    constructor(fs: FileSystem);
    /** Collect a bounded tree and source excerpts without calling mutation APIs. */
    inspect(task: string, cwd: string, signal?: AbortSignal): Promise<CaptainRepositoryContext | undefined>;
}
/** Select likely task-relevant files under complete file and byte limits. */
export declare function selectRepositoryFiles(entries: readonly RepositoryFileCandidate[], task: string, limits: RepositoryContextLimits): RepositoryFileCandidate[];
/** Convert repository evidence into a model-facing planning section. */
export declare function formatRepositoryContext(context: CaptainRepositoryContext): string;
/** Truncate complete Unicode code points to an inclusive UTF-8 byte limit. */
export declare function truncateUtf8(text: string, maxBytes: number): string;
//# sourceMappingURL=repository-context.d.ts.map