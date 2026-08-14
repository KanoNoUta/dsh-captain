import { describe, expect, it } from 'vitest'
import { parseReview, repairTasks, reviewPrompt } from '../src/reviewer.ts'
import type { CaptainTask, CaptainWorkerResult } from '../src/types.ts'

const tasks: CaptainTask[] = [
  { id: 'one', prompt: 'one', dependsOn: [], files: ['a.ts'], tokenBudget: 10 },
  { id: 'two', prompt: 'two', dependsOn: [], files: ['b.ts'], tokenBudget: 10 },
]
const workers: CaptainWorkerResult[] = [{ taskId: 'one', ok: true, output: 'done', changedFiles: ['a.ts'], tokens: 10 }]

describe('Captain reviewer protocol', () => {
  it('parses fenced JSON and normalizes malformed findings', () => {
    const review = parseReview('```json\n{"pass":false,"summary":"fix","findings":[{"message":"bug","taskId":"one","files":["a.ts"],"severity":"error"}]}\n```')
    expect(review).toEqual({ pass: false, summary: 'fix', findings: [{ id: 'finding-1', message: 'bug', taskId: 'one', files: ['a.ts'], severity: 'error' }] })
  })

  it('turns invalid or unscoped reviews into a full repair', () => {
    expect(parseReview('not json').pass).toBe(false)
    expect(repairTasks(tasks, parseReview('{"pass":false,"findings":[]}'))).toEqual(tasks)
  })

  it('targets only the tasks named by findings', () => {
    const review = parseReview('{"pass":false,"summary":"one","findings":[{"taskId":"one","message":"bug","files":[],"severity":"error"}]}')
    expect(repairTasks(tasks, review)).toEqual([tasks[0]])
    expect(reviewPrompt(['tests pass'], workers, 'diff')).toContain('Incremental git diff:\ndiff')
  })

  it('includes prerequisite tasks when repairing a dependent finding', () => {
    const chain: CaptainTask[] = [
      { id: 'prepare', prompt: 'prepare', dependsOn: [], files: ['a.ts'], tokenBudget: 10 },
      { id: 'finish', prompt: 'finish', dependsOn: ['prepare'], files: ['b.ts'], tokenBudget: 10 },
    ]
    const review = parseReview('{"pass":false,"summary":"finish","findings":[{"taskId":"finish","message":"bug","files":[],"severity":"error"}]}')
    expect(repairTasks(chain, review).map(task => task.id)).toEqual(['prepare', 'finish'])
  })
})
