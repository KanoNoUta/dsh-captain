import type { CaptainFinding, CaptainReview, CaptainTask, CaptainWorkerResult } from './types.ts'

/** Parse a reviewer response without trusting provider prose as control data. */
export function parseReview(raw: string): CaptainReview {
  const candidate = raw.match(/\{[\s\S]*\}/)?.[0]
  if (candidate === undefined) return { pass: false, summary: 'Reviewer returned no structured result.', findings: [{ id: 'review-format', message: raw.trim() || 'empty reviewer output', files: [], severity: 'error' }] }
  try {
    const value: unknown = JSON.parse(candidate)
    if (!isRecord(value) || typeof value.pass !== 'boolean' || !Array.isArray(value.findings)) throw new Error('invalid review object')
    const findings = value.findings.flatMap((item, index): CaptainFinding[] => {
      if (!isRecord(item) || typeof item.message !== 'string') return []
      const severity = item.severity === 'warning' || item.severity === 'info' ? item.severity : 'error'
      return [{
        id: typeof item.id === 'string' ? item.id : `finding-${index + 1}`,
        message: item.message,
        files: Array.isArray(item.files) ? item.files.filter((file): file is string => typeof file === 'string') : [],
        severity,
        ...typeof item.taskId === 'string' ? { taskId: item.taskId } : {},
      }]
    })
    return { pass: value.pass, summary: typeof value.summary === 'string' ? value.summary : '', findings }
  } catch {
    return { pass: false, summary: 'Reviewer JSON could not be parsed.', findings: [{ id: 'review-json', message: 'Reviewer response was not valid JSON.', files: [], severity: 'error' }] }
  }
}

/** Select only tasks touched by reviewer findings; an unscoped finding rechecks every task. */
export function repairTasks(tasks: readonly CaptainTask[], review: CaptainReview): CaptainTask[] {
  if (review.pass) return []
  const ids = new Set(review.findings.flatMap(finding => finding.taskId === undefined ? [] : [finding.taskId]))
  if (ids.size === 0) return [...tasks]
  const byId = new Map(tasks.map(task => [task.id, task]))
  const includeDependencies = (id: string): void => {
    const task = byId.get(id)
    if (task === undefined) return
    for (const dependency of task.dependsOn) {
      if (ids.has(dependency)) continue
      ids.add(dependency)
      includeDependencies(dependency)
    }
  }
  for (const id of [...ids]) includeDependencies(id)
  return tasks.filter(task => ids.has(task.id))
}

/** Render the compact review payload sent to GPT. */
export function reviewPrompt(
  acceptance: readonly string[],
  workers: readonly CaptainWorkerResult[],
  patch: string,
): string {
  return [
    'Review the incremental implementation as an independent code reviewer.',
    'Return JSON only: {"pass":boolean,"summary":string,"findings":[{"id":string,"taskId":string,"files":string[],"severity":"error|warning|info","message":string}]}',
    `Acceptance criteria:\n${acceptance.join('\n') || '(none)'}`,
    `Worker results:\n${JSON.stringify(workers)}`,
    `Incremental git diff:\n${patch || '(empty)'}`,
  ].join('\n\n')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
