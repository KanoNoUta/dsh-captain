import { describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { AttachmentId } from '@deepseek-ai/dsh-attachment'
import { createAssistantMessage, createUserMessage, type ContentBlock, type GenerateOptions } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import {
  CaptainOrchestrator,
  collectText,
  currentTaskText,
  isConversationalTask,
  isImageAnalysisTask,
  workspaceCwdFor,
} from '../src/orchestrator.ts'
import { DEFAULT_CAPTAIN_CONFIG } from '../src/config.ts'
import { inject } from '../src/index.ts'
import type { CaptainRepositoryReader } from '../src/types.ts'

describe('Captain native executor control plane', () => {
  it('turns terminal provider failures into control-call exceptions', async () => {
    const stream = (async function* () {
      yield { type: 'finish' as const, reason: { kind: 'error' as const, failure: { message: 'rate limited', code: 'RATE_LIMIT' } } }
    })()
    await expect(collectText(stream)).rejects.toMatchObject({ message: 'rate limited', code: 'RATE_LIMIT', failure: { code: 'RATE_LIMIT' } })
  })

  it('prepares a GPT DAG and hands it to DeepSeek as native-tool instructions', async () => {
    const requests: GenerateOptions[] = []
    const orchestrator = testOrchestrator([
      '{"tasks":[{"id":"inspect","prompt":"inspect runtime","dependsOn":[],"files":["src/a.ts"],"tokenBudget":10},{"id":"fix","prompt":"fix runtime","dependsOn":["inspect"],"files":["src/a.ts"],"tokenBudget":20}],"acceptance":["focused test passes"]}',
    ], requests)

    const prepared = await orchestrator.prepare(taskOptions())

    expect(prepared.kind).toBe('execution')
    if (prepared.kind !== 'execution') throw new Error('expected execution plan')
    expect(prepared.directive).toContain('First synchronize this DAG through the native todo_write tool.')
    expect(prepared.directive).toContain('native subagent and workflow tools')
    expect(prepared.directive).toContain('[inspect] inspect runtime')
    expect(prepared.directive).toContain('focused test passes')
    expect(requests).toHaveLength(1)
  })

  it('gives GPT the parent context and read-only repository evidence before planning', async () => {
    const requests: GenerateOptions[] = []
    const reader: CaptainRepositoryReader = {
      inspect: async () => ({
        cwd: 'F:\\project\\sample',
        tree: ['src/runtime.ts'],
        excerpts: [{ path: 'src/runtime.ts', text: 'export const runtime = true' }],
        omitted: [],
      }),
    }
    const orchestrator = testOrchestrator([
      '{"tasks":[{"id":"task-1","prompt":"fix runtime","dependsOn":[],"files":["src/runtime.ts"],"tokenBudget":10}],"acceptance":[]}',
    ], requests, undefined, {
      agents: { get: () => ({ session: { header: { cwd: 'F:\\project\\sample' } } }) },
      logger: { warn: () => undefined },
    } as unknown as Context, reader)
    const options = {
      ...taskOptions(),
      system: 'parent system context',
      messages: [
        createAssistantMessage({ content: [{ type: 'text', text: 'previous context' }], source: { provider: 'captain', model: 'captain' } }),
        ...taskOptions().messages,
      ],
      tools: [{ name: 'native_tool', description: 'must stay out of planner', parameters: {} }],
      sessionId: SessionId('parent-context'),
    }

    await orchestrator.prepare(options)

    expect(requests[0]?.system).toBe('parent system context')
    expect(requests[0]?.tools).toBeUndefined()
    expect(requests[0]?.messages.slice(0, -1)).toEqual(options.messages)
    expect(requestText(requests[0])).toContain('Repository context from the parent workspace:')
    expect(requestText(requests[0])).toContain('src/runtime.ts')
    expect(requestText(requests[0])).toContain('export const runtime = true')
  })

  it('bounds oversized planner history while keeping the current task', async () => {
    const requests: GenerateOptions[] = []
    const orchestrator = testOrchestrator([
      '{"tasks":[{"id":"task-1","prompt":"fix runtime","dependsOn":[],"files":[],"tokenBudget":10}],"acceptance":[]}',
    ], requests)
    const options: GenerateOptions = {
      ...taskOptions(),
      messages: [
        createAssistantMessage({ content: [{ type: 'text', text: 'old tool output '.repeat(30_000) }], source: { provider: 'captain', model: 'captain' } }),
        createUserMessage({ content: [{ type: 'text', text: 'fix the current runtime failure' }], source: { kind: 'user' } }),
      ],
    }

    await orchestrator.prepare(options)

    const plannerText = requestText(requests[0])
    expect(plannerText).toContain('fix the current runtime failure')
    expect(plannerText.length).toBeLessThan(200_000)
  })

  it('falls back to a native single-task plan after a planner transport failure', async () => {
    const requests: GenerateOptions[] = []
    const orchestrator = new CaptainOrchestrator(testContext(), testConfig, {
      stream: async function* (options) {
        requests.push(options)
        const error = new Error('Stream ended without finish_reason') as Error & { code: string }
        error.code = 'TRANSPORT'
        throw error
      },
    })

    const prepared = await orchestrator.prepare(taskOptions())

    expect(prepared.kind).toBe('execution')
    if (prepared.kind !== 'execution') throw new Error('expected execution fallback')
    expect(prepared.plan.tasks).toEqual([
      { id: 'task-1', prompt: 'fix the implementation', dependsOn: [], files: [], tokenBudget: 8000 },
    ])
    expect(requests).toHaveLength(1)
  })

  it('preserves the parent system, tools, history, session, limits, and signal on the DeepSeek request', async () => {
    const orchestrator = testOrchestrator([], [])
    const controller = new AbortController()
    const options: GenerateOptions = {
      ...taskOptions(),
      system: 'parent tool instructions',
      tools: [{ name: 'todo_write', description: 'native todo', parameters: { type: 'object' } }],
      signal: controller.signal,
      sessionId: SessionId('native-parent'),
      maxTokens: 1234,
    }
    const turn = orchestrator.recover(options)

    const request = await orchestrator.workerRequest(options, turn)

    expect(request.provider).toBe(DEFAULT_CAPTAIN_CONFIG.worker.provider)
    expect(request.model).toBe(DEFAULT_CAPTAIN_CONFIG.worker.model)
    expect(request.system).toBe(options.system)
    expect(request.tools).toBe(options.tools)
    expect(request.signal).toBe(controller.signal)
    expect(request.sessionId).toBe(options.sessionId)
    expect(request.maxTokens).toBe(1234)
    expect(request.messages.slice(0, -1)).toEqual(options.messages)
    expect(request.messages.at(-1)?.source).toMatchObject({ kind: 'plugin', plugin: 'captain', form: 'relay' })
  })

  it('recovers a tool continuation without making another GPT call', () => {
    const requests: GenerateOptions[] = []
    const orchestrator = testOrchestrator([], requests)
    const recovered = orchestrator.recover(taskOptions())

    expect(recovered.plan.tasks[0]?.prompt).toBe('fix the implementation')
    expect(recovered.directive).toContain('todo_write')
    expect(requests).toHaveLength(0)
  })

  it('inherits parent instructions without exposing mutation tools to the planner', async () => {
    const requests: GenerateOptions[] = []
    const orchestrator = testOrchestrator([
      '{"tasks":[{"id":"task-1","prompt":"fix","dependsOn":[],"files":[],"tokenBudget":10}],"acceptance":[]}',
    ], requests)
    const options = { ...taskOptions(), system: 'Use native repository tools.', tools: [{ name: 'pwsh', description: 'shell', parameters: {} }] }

    const prepared = await orchestrator.prepare(options)
    if (prepared.kind !== 'execution') throw new Error('expected execution plan')
    const worker = await orchestrator.workerRequest(options, prepared)

    expect(requests[0]?.system).toBe(options.system)
    expect(requests[0]).not.toHaveProperty('tools')
    expect(worker.system).toBe(options.system)
    expect(worker.tools).toBe(options.tools)
  })

  it('retries malformed reviewer output once with strict JSON correction', async () => {
    const requests: GenerateOptions[] = []
    const orchestrator = testOrchestrator([
      'Looks good.',
      '{"pass":true,"summary":"accepted","findings":[]}',
    ], requests)
    const turn = orchestrator.recover(taskOptions())

    const result = await orchestrator.review(turn.plan, 'Changed src/a.ts and tests passed.', taskOptions())

    expect(result.review).toMatchObject({ pass: true, summary: 'accepted' })
    expect(requests).toHaveLength(2)
    expect(requestText(requests[0])).toContain('Planned task DAG')
    expect(requestText(requests[0])).toContain('An empty Git diff is correct')
    expect(requestText(requests[1])).toContain('Return exactly one JSON object')
  })

  it('returns one vision result directly for a pure image-analysis turn', async () => {
    const requests: GenerateOptions[] = []
    const orchestrator = new CaptainOrchestrator({} as Context, () => structuredClone(DEFAULT_CAPTAIN_CONFIG), {
      listModels: async provider => [{ provider, id: 'gpt-5.6-terra', name: 'Terra', inputModalities: ['text', 'image'] }],
      stream: async function* (options) {
        requests.push(options)
        yield { type: 'text-delta', index: 0, text: '截图显示 UNSUPPORTED_CONTENT。' }
        yield { type: 'finish', reason: { kind: 'stop' } }
      },
    })
    const result = await orchestrator.prepare({
      provider: 'captain',
      model: 'captain:test',
      messages: [createUserMessage({
        content: [
          { type: 'text', text: '识别这张图片并说明主要报错' },
          { type: 'image', attachment: { attachmentId: AttachmentId('sha256:test'), mediaType: 'image/png', bytes: 4, width: 1, height: 1 } },
        ],
        source: { kind: 'user' },
      })],
    })
    expect(result).toEqual({ kind: 'direct', text: '截图显示 UNSUPPORTED_CONTENT。' })
    expect(requests).toHaveLength(1)
    expect(requests[0]).not.toHaveProperty('reasoningEffort')
  })

  it('keeps implementation images on the vision route and out of the DeepSeek executor request', async () => {
    const requests: GenerateOptions[] = []
    const orchestrator = new CaptainOrchestrator(testContext(), testConfig, {
      listModels: async provider => [{ provider, id: 'gpt-5.6-terra', name: 'Terra', inputModalities: ['text', 'image'] }],
      stream: async function* (options) {
        requests.push(options)
        const response = requests.length === 1
          ? 'The screenshot shows a broken upload button.'
          : '{"tasks":[{"id":"fix-upload","prompt":"Fix the upload button described by the vision notes.","dependsOn":[],"files":[],"tokenBudget":8000}],"acceptance":["upload works"]}'
        yield { type: 'text-delta', index: 0, text: response }
        yield { type: 'finish', reason: { kind: 'stop' } }
      },
    })
    const options: GenerateOptions = {
      provider: 'captain',
      model: 'captain:test',
      messages: [createUserMessage({
        content: [
          { type: 'text', text: '修复截图里的上传问题' },
          { type: 'image', attachment: { attachmentId: AttachmentId('sha256:implementation'), mediaType: 'image/png', bytes: 4, width: 1, height: 1 } },
        ],
        source: { kind: 'user' },
      })],
    }

    const prepared = await orchestrator.prepare(options)
    if (prepared.kind !== 'execution') throw new Error('expected image implementation plan')
    const worker = await orchestrator.workerRequest(options, prepared)

    expect(requestText(requests[1])).toContain('Vision companion notes:\nThe screenshot shows a broken upload button.')
    expect(hasImageBlock(worker.messages)).toBe(false)
  })

  it('classifies social, visual, and current direct-user turns', () => {
    expect(isConversationalTask('晚上好')).toBe(true)
    expect(isConversationalTask('修复模型选择器里的 DeepSeek 路由')).toBe(false)
    expect(isImageAnalysisTask('识别这张图片并说明主要报错')).toBe(true)
    expect(isImageAnalysisTask('修复截图里显示的图片识别错误并发布')).toBe(false)
    const messages = [
      createUserMessage({ content: [{ type: 'text', text: 'old task' }], source: { kind: 'user' } }),
      createAssistantMessage({ content: [{ type: 'text', text: 'done' }], source: { provider: 'captain', model: 'captain' } }),
      createUserMessage({ content: [{ type: 'text', text: 'new task' }], source: { kind: 'user' } }),
    ]
    expect(currentTaskText(messages)).toBe('new task')
  })

  it('declares the Host services used by native planning and execution', () => {
    expect(inject).toEqual(['llm', 'settings', 'agents', 'fs'])
  })

  it('resolves Git work from the parent session cwd instead of the host cwd', () => {
    const sessionId = SessionId('parent')
    const ctx = {
      agents: { get: (id: string) => id === sessionId ? { session: { header: { cwd: 'F:\\project\\lis' } } } : undefined },
    } as unknown as Context
    expect(workspaceCwdFor(ctx, sessionId)).toBe('F:\\project\\lis')
    expect(workspaceCwdFor(ctx, undefined)).toBeUndefined()
  })
})

function testConfig() {
  const config = structuredClone(DEFAULT_CAPTAIN_CONFIG)
  config.orchestration.maxRepairRounds = 0
  return config
}

function testContext(): Context {
  return { agents: { get: () => undefined } } as unknown as Context
}

function testOrchestrator(
  responses: string[],
  requests: GenerateOptions[],
  _unused?: undefined,
  ctx: Context = testContext(),
  reader?: CaptainRepositoryReader,
): CaptainOrchestrator {
  return new CaptainOrchestrator(ctx, testConfig, {
    stream: async function* (options) {
      requests.push(options)
      const response = responses.shift()
      if (response === undefined) throw new Error('unexpected Captain request')
      yield { type: 'text-delta', index: 0, text: response }
      yield { type: 'finish', reason: { kind: 'stop' } }
    },
  }, reader)
}

function taskOptions(): GenerateOptions {
  return {
    provider: 'captain',
    model: 'captain:test',
    messages: [createUserMessage({ content: [{ type: 'text', text: 'fix the implementation' }], source: { kind: 'user' } })],
  }
}

function requestText(options: GenerateOptions | undefined): string {
  if (options === undefined) return ''
  return options.messages.flatMap(message => message.content.flatMap(block => block.type === 'text' ? [block.text] : [])).join('\n')
}

function hasImageBlock(messages: GenerateOptions['messages']): boolean {
  const visit = (blocks: readonly ContentBlock[]): boolean => blocks.some(block => (
    block.type === 'image' || (block.type === 'tool-result' && visit(block.content))
  ))
  return messages.some(message => visit(message.content))
}
