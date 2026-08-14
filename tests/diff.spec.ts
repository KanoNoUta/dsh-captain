import { describe, expect, it } from 'vitest'
import { advanceCheckpoint, diffHash, incrementalDiff } from '../src/diff.ts'

describe('Captain incremental diff', () => {
  it('hashes deterministically and advances only with the observed head', () => {
    expect(diffHash('Captain')).toBe(diffHash('Captain'))
    const diff = { head: 'abc', patch: 'patch', changedFiles: ['a.ts'], hash: diffHash('patch') }
    expect(advanceCheckpoint(diff, 123)).toEqual({ head: 'abc', diffHash: diffHash('patch'), changedFiles: ['a.ts'], createdAt: 123 })
  })

  it('asks Git for staged and working-tree changes from the checkpoint', async () => {
    const calls: string[][] = []
    const git = { run: async (args: readonly string[]) => {
      calls.push([...args])
      if (args[0] === 'rev-parse') return 'head\n'
      if (args[0] === 'diff' && args.includes('--name-only')) return 'src/a.ts\n'
      if (args[0] === 'status') return ' M src/a.ts\n?? src/new.ts\n'
      return 'patch\n'
    } }
    expect(await incrementalDiff(git)).toMatchObject({ head: 'head', patch: 'patch\n', changedFiles: ['src/a.ts', 'src/new.ts'] })
    expect(calls).toContainEqual(['diff', '--no-ext-diff', '--binary', 'HEAD'])
    calls.length = 0
    await incrementalDiff(git, { head: 'old', diffHash: '0', changedFiles: [], createdAt: 1 })
    expect(calls).toContainEqual(['diff', '--no-ext-diff', '--binary', 'old'])
  })
})
