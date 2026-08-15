import type { CaptainFinding, CaptainReview, CaptainTask, CaptainWorkerResult } from './types.ts'

/** Parse a reviewer response without trusting provider prose as control data. */
export function parseReview(raw: string): CaptainReview {
  const candidates = jsonObjects(raw)
  if (candidates.length === 0) {
    return { pass: false, summary: 'Reviewer returned no structured result.', findings: [{ id: 'review-format', message: raw.trim() || 'empty reviewer output', files: [], severity: 'error' }] }
  }
  for (const candidate of candidates) {
    try {
      const value: unknown = JSON.parse(candidate)
      if (!isRecord(value) || typeof value.pass !== 'boolean' || !Array.isArray(value.findings)) continue
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
      const pass = value.pass && !findings.some(finding => finding.severity === 'error')
      return { pass, summary: typeof value.summary === 'string' ? value.summary : '', findings }
    } catch {
      // A later balanced object may be the reviewer result.
    }
  }
  return { pass: false, summary: 'Reviewer JSON could not be parsed.', findings: [{ id: 'review-json', message: 'Reviewer response was not valid reviewer JSON.', files: [], severity: 'error' }] }
}

/**
 * Whether one malformed provider response merits the single protocol correction retry.
 * @param review - Parsed review or parser-generated protocol finding.
 * @returns True for a reviewer format failure.
 */
export function reviewNeedsRetry(review: CaptainReview): boolean {
  return review.findings.some(finding => finding.id === 'review-format' || finding.id === 'review-json')
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
    'Do not return prose, Markdown, DSML, function calls, or tool calls.',
    `Acceptance criteria:\n${acceptance.join('\n') || '(none)'}`,
    `Worker results:\n${JSON.stringify(workers)}`,
    `Incremental git diff:\n${patch || '(empty)'}`,
  ].join('\n\n')
}

function jsonObjects(raw: string): string[] {
  const fenced: string[] = []
  for (const match of raw.matchAll(/```(?:json)?\s*([\s\S]*?)```/giu)) {
    if (match[1] !== undefined) fenced.push(...balancedObjects(match[1]))
  }
  const all = balancedObjects(raw)
  return [...new Set([...fenced, ...all])]
}

function balancedObjects(raw: string): string[] {
  const objects: string[] = []
  let start = -1
  let depth = 0
  let inString = false
  let escaped = false
  for (let index = 0; index < raw.length; index += 1) {
    const character = raw[index]
    if (inString) {
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === '"') inString = false
      continue
    }
    if (character === '"') {
      inString = true
      continue
    }
    if (character === '{') {
      if (depth === 0) start = index
      depth += 1
      continue
    }
    if (character !== '}' || depth === 0) continue
    depth -= 1
    if (depth === 0 && start >= 0) {
      objects.push(raw.slice(start, index + 1))
      start = -1
    }
  }
  return objects
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
