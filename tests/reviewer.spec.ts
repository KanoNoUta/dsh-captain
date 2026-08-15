import { describe, expect, it } from 'vitest'
import { parseReview, repairTasks, reviewNeedsRetry, reviewPrompt } from '../src/reviewer.ts'
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

  it('extracts the first valid reviewer object without greedily joining prose objects', () => {
    const review = parseReview('metadata {"attempt":1}\n```json\n{"pass":true,"summary":"ok","findings":[]}\n```\ntrailer {"ignored":true}')
    expect(review).toEqual({ pass: true, summary: 'ok', findings: [] })
  })

  it('marks only reviewer protocol failures as retryable', () => {
    expect(reviewNeedsRetry(parseReview('not json'))).toBe(true)
    expect(reviewNeedsRetry(parseReview('{broken}'))).toBe(true)
    expect(reviewNeedsRetry(parseReview('{"pass":false,"summary":"bug","findings":[{"message":"fix it"}]}'))).toBe(false)
  })

  it('does not pass a review that contains an error finding', () => {
    const review = parseReview('{"pass":true,"summary":"contradictory","findings":[{"message":"still broken","severity":"error"}]}')
    expect(review.pass).toBe(false)
  })
})
