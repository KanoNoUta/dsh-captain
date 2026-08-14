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
/** Build a validated scheduler state. */
export declare function createSchedulerState(config: CaptainOrchestrationConfig): SchedulerState;
/** Validate DAG ids, dependencies, and ownership metadata before execution. */
export declare function validateTasks(tasks: readonly CaptainTask[]): void;
/** Select ready tasks while avoiding concurrent writes to overlapping files. */
export declare function readyTasks(tasks: readonly CaptainTask[], state: SchedulerState): CaptainTask[];
/** Mark tasks whose prerequisites failed so a failed branch cannot stall the DAG. */
export declare function settleBlockedTasks(tasks: readonly CaptainTask[], state: SchedulerState): CaptainTask[];
/** Reserve a task and account its budget before starting a child. */
export declare function startTask(state: SchedulerState, task: CaptainTask, config: CaptainOrchestrationConfig): void;
/** Settle a task and feed provider pressure back into the parallel limit. */
export declare function finishTask(state: SchedulerState, task: CaptainTask, observation: SchedulerObservation, config: CaptainOrchestrationConfig): void;
/** Whether the DAG has no remaining executable work. */
export declare function isSettled(tasks: readonly CaptainTask[], state: SchedulerState): boolean;
//# sourceMappingURL=scheduler.d.ts.map