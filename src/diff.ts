import type { CaptainCheckpoint } from './types.ts'

/** Minimal Git runner required by the incremental review projection. */
export interface GitReader {
  run(args: readonly string[]): Promise<string>
}

/** Result of comparing the workspace to a previous checkpoint. */
export interface IncrementalDiff {
  head: string
  patch: string
  changedFiles: string[]
  hash: string
}

/** Compute a stable FNV-1a hash without a crypto dependency in the browser-safe projection. */
export function diffHash(value: string): string {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

/** Read changes after the checkpoint's recorded HEAD, including staged and working-tree edits. */
export async function incrementalDiff(git: GitReader, checkpoint?: CaptainCheckpoint): Promise<IncrementalDiff> {
  const head = (await git.run(['rev-parse', 'HEAD'])).trim()
  const range = checkpoint === undefined
    ? ['diff', '--no-ext-diff', '--binary', 'HEAD']
    : ['diff', '--no-ext-diff', '--binary', checkpoint.head]
  const patch = await git.run(range)
  const names = await git.run(checkpoint === undefined
    ? ['status', '--short', '--untracked-files=all']
    : ['diff', '--name-only', checkpoint.head])
  const changedFiles = names.split(/\r?\n/)
    .map(line => line.replace(/^\s*[MADRCU?!]+\s+/, '').trim())
    .filter(Boolean)
  return { head, patch, changedFiles, hash: diffHash(patch) }
}

/** Advance the checkpoint only after a reviewer pass. */
export function advanceCheckpoint(diff: IncrementalDiff, now = Date.now()): CaptainCheckpoint {
  return { head: diff.head, diffHash: diff.hash, changedFiles: [...diff.changedFiles], createdAt: now }
}
