import type { CaptainOrchestrationConfig, CaptainTask } from './types.ts';
/** Runtime scheduler observations used to adapt parallelism after provider pressure. */
export interface SchedulerObservation {
    rateLimited?: boolean;
    timedOut?: boolean;
    succeeded?: boolean;
}
/** Mutable scheduler state kept by one Captain run. */
export interface SchedulerState {
    completed: Set<string>;
    running: Set<string>;
    failed: Set<string>;
    tokensUsed: number;
    parallelLimit: number;
}
/** Build a validated scheduler state.
 * @param config - Scheduler limits and adaptive policy.
 * @returns Empty runtime state initialized from the configuration.
 */
export declare function createSchedulerState(config: CaptainOrchestrationConfig): SchedulerState;
/** Validate DAG ids, dependencies, and ownership metadata before execution.
 * @param tasks - Planner-produced task list.
 */
export declare function validateTasks(tasks: readonly CaptainTask[]): void;
/** Select ready tasks while avoiding concurrent writes to overlapping files.
 * @param tasks - Planner-produced task list.
 * @param state - Current scheduler state.
 * @returns Tasks eligible to start in this scheduling pass.
 */
export declare function readyTasks(tasks: readonly CaptainTask[], state: SchedulerState): CaptainTask[];
/** Mark tasks whose prerequisites failed so a failed branch cannot stall the DAG.
 * @param tasks - Planner-produced task list.
 * @param state - Current scheduler state.
 * @returns Tasks newly marked as blocked.
 */
export declare function settleBlockedTasks(tasks: readonly CaptainTask[], state: SchedulerState): CaptainTask[];
/** Reserve a task and account its budget before starting a child.
 * @param state - Current scheduler state.
 * @param task - Task to reserve.
 * @param config - Scheduler limits and token budget.
 */
export declare function startTask(state: SchedulerState, task: CaptainTask, config: CaptainOrchestrationConfig): void;
/** Settle a task and feed provider pressure back into the parallel limit.
 * @param state - Current scheduler state.
 * @param task - Task whose child run finished.
 * @param observation - Provider outcome used by adaptive scheduling.
 * @param config - Scheduler limits and adaptive policy.
 */
export declare function finishTask(state: SchedulerState, task: CaptainTask, observation: SchedulerObservation, config: CaptainOrchestrationConfig): void;
/** Whether the DAG has no remaining executable work.
 * @param tasks - Planner-produced task list.
 * @param state - Current scheduler state.
 * @returns True when every task is settled and no child is running.
 */
export declare function isSettled(tasks: readonly CaptainTask[], state: SchedulerState): boolean;
//# sourceMappingURL=scheduler.d.ts.map