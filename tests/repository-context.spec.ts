import { describe, expect, it } from 'vitest'
import { FsTargetKey, type FileSystem, type FsDirEntry, type FsTarget } from '@deepseek-ai/dsh-fs'
import {
  FileSystemRepositoryReader,
  formatRepositoryContext,
  selectRepositoryFiles,
  truncateUtf8,
  type RepositoryContextLimits,
  type RepositoryFileCandidate,
} from '../src/repository-context.ts'

describe('Captain read-only repository context', () => {
  const limits: RepositoryContextLimits = { maxFiles: 2, maxFileBytes: 100, maxTotalBytes: 200 }

  it('ranks task matches and repository instructions before unrelated generated files', () => {
    const entries = [
      candidateEntry('lib/generated.js', 10),
      candidateEntry('README.md', 10),
      candidateEntry('src/runtime.ts', 10),
      candidateEntry('src/other.ts', 10),
      candidateEntry('AGENTS.md', 10),
    ]

    expect(selectRepositoryFiles(entries, 'fix runtime lifecycle', limits).map(item => item.path)).toEqual([
      'AGENTS.md',
      'src/runtime.ts',
    ])
  })

  it('formats bounded excerpts and names omitted files', () => {
    const result = formatRepositoryContext({
      cwd: 'F:\\project\\sample',
      tree: ['AGENTS.md', 'src/runtime.ts', 'src/other.ts'],
      excerpts: [
        { path: 'AGENTS.md', text: 'rules' },
        { path: 'src/runtime.ts', text: 'runtime' },
      ],
      omitted: ['src/other.ts'],
    })

    expect(result).toContain('Repository context from the parent workspace:')
    expect(result).toContain('Workspace: F:\\project\\sample')
    expect(result).toContain('AGENTS.md')
    expect(result).toContain('src/runtime.ts')
    expect(result).toContain('Omitted by the read-only analysis budget: src/other.ts')
  })

  it('keeps multibyte source excerpts inside the UTF-8 byte budget', () => {
    const bounded = truncateUtf8('中文代码alpha', 7)
    expect(Buffer.byteLength(bounded, 'utf8')).toBeLessThanOrEqual(7)
    expect(bounded).toBe('中文')
  })

  it('uses read-only filesystem calls, skips generated directories, and reports files outside the scan budget', async () => {
    const reads: string[] = []
    const root = target('.')
    const source = target('src')
    const generated = target('node_modules')
    const sourceFiles = Array.from({ length: 60 }, (_, index) => fsEntry(`file-${String(index).padStart(2, '0')}.ts`, 4, `src/file-${String(index).padStart(2, '0')}.ts`))
    const fs = {
      resolve: async () => root,
      listDir: async (directory: FsTarget): Promise<FsDirEntry[]> => {
        if (directory.targetKey === root.targetKey) {
          return [
            fsEntry('AGENTS.md', 5),
            { name: 'node_modules', type: 'directory', target: generated },
            { name: 'src', type: 'directory', target: source },
          ]
        }
        if (directory.targetKey === source.targetKey) return sourceFiles
        throw new Error(`unexpected directory read: ${directory.displayPath}`)
      },
      readText: async (file: FsTarget): Promise<string> => {
        reads.push(file.displayPath)
        return file.displayPath === 'AGENTS.md' ? 'rules' : 'code'
      },
    } as unknown as FileSystem

    const context = await new FileSystemRepositoryReader(fs).inspect('fix source files', 'F:\\project\\sample')

    expect(context?.excerpts).toHaveLength(48)
    expect(context?.omitted).toHaveLength(13)
    expect(context?.tree).not.toContain('node_modules/')
    expect(reads).not.toContain('node_modules')
  })
})

function candidateEntry(path: string, size: number): RepositoryFileCandidate {
  return { path, size, target: {} as never }
}

function target(path: string): FsTarget {
  return { targetKey: FsTargetKey(path), displayPath: path }
}

function fsEntry(name: string, size: number, path = name): FsDirEntry & RepositoryFileCandidate {
  return { name, path, size, type: 'file', target: target(path) }
}
