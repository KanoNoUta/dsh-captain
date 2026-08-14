import { describe, expect, it } from 'vitest'
import { createSchedulerState, finishTask, readyTasks, settleBlockedTasks, startTask, validateTasks } from '../src/scheduler.ts'
import type { CaptainOrchestrationConfig, CaptainTask } from '../src/types.ts'

const config = (overrides: Partial<CaptainOrchestrationConfig> = {}): CaptainOrchestrationConfig => ({
  mode: 'auto', minAgents: 1, maxAgents: 4, maxParallel: 2, totalTokenBudget: 100,
  reviewerTokenBudget: 20, maxRepairRounds: 2, adaptiveConcurrency: true, ...overrides,
})
const task = (
  id: string,
  files: string[] = [],
  dependsOn: string[] = [],
  tokenBudget = 10,
): CaptainTask => ({ id, prompt: id, files, dependsOn, tokenBudget })

describe('Captain scheduler', () => {
  it('validates missing dependencies and cycles', () => {
    expect(() => { validateTasks([task('a', [], ['missing'])]) }).toThrow('missing task')
    expect(() => { validateTasks([task('a', [], ['b']), task('b', [], ['a'])]) }).toThrow('dependency cycle')
  })

  it('selects independent tasks but reserves overlapping files', () => {
    const state = createSchedulerState(config())
    const tasks = [task('a', ['src/a.ts']), task('b', ['src/b.ts']), task('c', ['src/a.ts'])]
    expect(readyTasks(tasks, state).map(item => item.id)).toEqual(['a', 'b'])
    startTask(state, tasks[0]!, config())
    expect(readyTasks(tasks, state).map(item => item.id)).toEqual(['b'])
  })

  it('adapts parallelism to provider pressure and success', () => {
    const state = createSchedulerState(config())
    const t = task('a')
    startTask(state, t, config())
    finishTask(state, t, { timedOut: true }, config())
    expect(state.parallelLimit).toBe(1)
    startTask(state, t, config())
    finishTask(state, t, { succeeded: true }, config())
    expect(state.parallelLimit).toBe(2)
  })

  it('settles transitive dependants after a failed task', () => {
    const state = createSchedulerState(config())
    const tasks = [task('a'), task('b', [], ['a']), task('c', [], ['b'])]
    startTask(state, tasks[0]!, config())
    finishTask(state, tasks[0]!, { succeeded: false }, config())
    expect(settleBlockedTasks(tasks, state).map(item => item.id)).toEqual(['b', 'c'])
    expect(readyTasks(tasks, state)).toEqual([])
  })
})
