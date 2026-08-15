import type { CaptainOrchestrationConfig, CaptainTask } from './types.ts'

/** Runtime scheduler observations used to adapt parallelism after provider pressure. */
export interface SchedulerObservation {
  rateLimited?: boolean
  timedOut?: boolean
  succeeded?: boolean
}

/** Mutable scheduler state kept by one Captain run. */
export interface SchedulerState {
  completed: Set<string>
  running: Set<string>
  failed: Set<string>
  tokensUsed: number
  parallelLimit: number
}

/** Build a validated scheduler state.
 * @param config - Scheduler limits and adaptive policy.
 * @returns Empty runtime state initialized from the configuration.
 */
export function createSchedulerState(config: CaptainOrchestrationConfig): SchedulerState {
  return { completed: new Set(), running: new Set(), failed: new Set(), tokensUsed: 0, parallelLimit: limitOf(config) }
}

/** Validate DAG ids, dependencies, and ownership metadata before execution.
 * @param tasks - Planner-produced task list.
 */
export function validateTasks(tasks: readonly CaptainTask[]): void {
  const ids = new Set<string>()
  for (const task of tasks) {
    if (!/^[a-zA-Z0-9_-]+$/.test(task.id)) throw new Error(`Captain task id is invalid: ${task.id}`)
    if (ids.has(task.id)) throw new Error(`Captain task id is duplicated: ${task.id}`)
    ids.add(task.id)
    if (task.prompt.trim() === '') throw new Error(`Captain task ${task.id} has an empty prompt`)
    if (task.files.some(file => file.trim() === '')) throw new Error(`Captain task ${task.id} has an empty file owner`)
    if (!Number.isFinite(task.tokenBudget) || task.tokenBudget <= 0) throw new Error(`Captain task ${task.id} has an invalid token budget`)
  }
  for (const task of tasks) {
    for (const dependency of task.dependsOn) {
      if (!ids.has(dependency)) throw new Error(`Captain task ${task.id} depends on missing task ${dependency}`)
      if (dependency === task.id) throw new Error(`Captain task ${task.id} cannot depend on itself`)
    }
  }
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const byId = new Map(tasks.map(task => [task.id, task]))
  const visit = (id: string): void => {
    if (visited.has(id)) return
    if (visiting.has(id)) throw new Error(`Captain task dependency cycle includes ${id}`)
    visiting.add(id)
    for (const dependency of byId.get(id)?.dependsOn ?? []) visit(dependency)
    visiting.delete(id)
    visited.add(id)
  }
  for (const task of tasks) visit(task.id)
}

/** Select ready tasks while avoiding concurrent writes to overlapping files.
 * @param tasks - Planner-produced task list.
 * @param state - Current scheduler state.
 * @returns Tasks eligible to start in this scheduling pass.
 */
export function readyTasks(tasks: readonly CaptainTask[], state: SchedulerState): CaptainTask[] {
  const occupied = new Set(tasks.filter(task => state.running.has(task.id)).flatMap(task => task.files))
  return tasks.filter(task => !state.completed.has(task.id) && !state.failed.has(task.id) && !state.running.has(task.id))
    .filter(task => task.dependsOn.every(id => state.completed.has(id)))
    .filter(task => task.files.every(file => !occupied.has(file)))
    .slice(0, state.parallelLimit)
}

/** Mark tasks whose prerequisites failed so a failed branch cannot stall the DAG.
 * @param tasks - Planner-produced task list.
 * @param state - Current scheduler state.
 * @returns Tasks newly marked as blocked.
 */
export function settleBlockedTasks(tasks: readonly CaptainTask[], state: SchedulerState): CaptainTask[] {
  const blocked: CaptainTask[] = []
  let changed = true
  while (changed) {
    changed = false
    for (const task of tasks) {
      if (state.completed.has(task.id) || state.failed.has(task.id) || state.running.has(task.id)) continue
      if (!task.dependsOn.some(id => state.failed.has(id))) continue
      state.failed.add(task.id)
      blocked.push(task)
      changed = true
    }
  }
  return blocked
}

/** Reserve a task and account its budget before starting a child.
 * @param state - Current scheduler state.
 * @param task - Task to reserve.
 * @param config - Scheduler limits and token budget.
 */
export function startTask(state: SchedulerState, task: CaptainTask, config: CaptainOrchestrationConfig): void {
  if (state.running.has(task.id)) throw new Error(`Captain task ${task.id} is already running`)
  if (state.tokensUsed + task.tokenBudget > config.totalTokenBudget) {
    throw new Error(`Captain token budget exceeded before task ${task.id}`)
  }
  state.running.add(task.id)
  state.tokensUsed += task.tokenBudget
}

/** Settle a task and feed provider pressure back into the parallel limit.
 * @param state - Current scheduler state.
 * @param task - Task whose child run finished.
 * @param observation - Provider outcome used by adaptive scheduling.
 * @param config - Scheduler limits and adaptive policy.
 */
export function finishTask(
  state: SchedulerState,
  task: CaptainTask,
  observation: SchedulerObservation,
  config: CaptainOrchestrationConfig,
): void {
  state.running.delete(task.id)
  if (observation.succeeded === false) state.failed.add(task.id)
  else state.completed.add(task.id)
  if (!config.adaptiveConcurrency) return
  if (observation.rateLimited || observation.timedOut) state.parallelLimit = Math.max(1, Math.floor(state.parallelLimit / 2))
  else if (observation.succeeded === true) state.parallelLimit = Math.min(limitOf(config), state.parallelLimit + 1)
}

/** Whether the DAG has no remaining executable work.
 * @param tasks - Planner-produced task list.
 * @param state - Current scheduler state.
 * @returns True when every task is settled and no child is running.
 */
export function isSettled(tasks: readonly CaptainTask[], state: SchedulerState): boolean {
  return tasks.every(task => state.completed.has(task.id) || state.failed.has(task.id)) && state.running.size === 0
}

function limitOf(config: CaptainOrchestrationConfig): number {
  const configured = config.maxParallel > 0 ? config.maxParallel : config.maxAgents
  return Math.max(1, Math.min(config.maxAgents, configured))
}
