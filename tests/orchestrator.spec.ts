import { describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { AttachmentId } from '@deepseek-ai/dsh-attachment'
import { createAssistantMessage, createUserMessage, type GenerateOptions } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import { CaptainOrchestrator, collectText, currentTaskText, isConversationalTask, isImageAnalysisTask, isToolCallOnlyOutput, workspaceCwdFor } from '../src/orchestrator.ts'
import { DEFAULT_CAPTAIN_CONFIG } from '../src/config.ts'
import { inject } from '../src/index.ts'

describe('Captain nested LLM calls', () => {
  it('turns terminal provider failures into worker-visible exceptions', async () => {
    const stream = (async function* () {
      yield { type: 'finish' as const, reason: { kind: 'error' as const, failure: { message: 'rate limited', code: 'RATE_LIMIT' } } }
    })()
    await expect(collectText(stream)).rejects.toMatchObject({ message: 'rate limited', code: 'RATE_LIMIT', failure: { code: 'RATE_LIMIT' } })
  })

  it('recognizes short conversational greetings before starting a coding run', () => {
    expect(isConversationalTask('\u665a\u4e0a\u597d')).toBe(true)
    expect(isConversationalTask('\u4fEE\u590D\u6A21\u578B\u9009\u62E9\u5668\u91CC\u7684 DeepSeek \u8DEF\u7531')).toBe(false)
  })

  it('returns pure image-analysis turns without starting implementation workers', () => {
    expect(isImageAnalysisTask('识别这张图片并说明主要报错')).toBe(true)
    expect(isImageAnalysisTask('修复截图里显示的图片识别错误并发布')).toBe(false)
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
    const result = await orchestrator.run({
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
    expect(result).toBe('截图显示 UNSUPPORTED_CONTENT。')
    expect(requests).toHaveLength(1)
    expect(requests[0]).not.toHaveProperty('reasoningEffort')
  })

  it('uses only the latest direct user message as the current task', () => {
    const messages = [
      createUserMessage({ content: [{ type: 'text', text: 'implement the Captain plugin' }], source: { kind: 'user' } }),
      createAssistantMessage({ content: [{ type: 'text', text: 'Captain review stopped with findings.' }], source: { provider: 'captain', model: 'captain' } }),
      createUserMessage({ content: [{ type: 'text', text: '\u665a\u4e0a\u597d' }], source: { kind: 'user' } }),
    ]
    expect(currentTaskText(messages)).toBe('\u665a\u4e0a\u597d')
    expect(isConversationalTask(currentTaskText(messages))).toBe(true)
  })

  it('declares host services used by workflow-backed workers', () => {
    expect(inject).toEqual(['llm', 'settings', 'agents'])
  })

  it('recognizes an unexecuted DSML tool-call response without matching a normal report', () => {
    expect(isToolCallOnlyOutput('<｜｜DSML｜｜tool_calls><｜｜DSML｜｜invoke name="pwd"/></｜｜DSML｜｜tool_calls>')).toBe(true)
    expect(isToolCallOnlyOutput('The provider emitted `<｜｜DSML｜｜tool_calls>` earlier; I then changed src/a.ts and tests passed.')).toBe(false)
  })

  it('retries one DSML-only worker response before accepting the worker', async () => {
    const responses = [
      '{"tasks":[{"id":"task-1","prompt":"fix","dependsOn":[],"files":[],"tokenBudget":10}],"acceptance":[]}',
      '<｜｜DSML｜｜tool_calls><｜｜DSML｜｜invoke name="pwd"/></｜｜DSML｜｜tool_calls>',
      'Changed src/a.ts and focused tests passed.',
      '{"pass":true,"summary":"accepted","findings":[]}',
    ]
    const requests: GenerateOptions[] = []
    const orchestrator = testOrchestrator(responses, requests)

    const result = await orchestrator.run(taskOptions())

    expect(result).toContain('Captain review passed.')
    expect(result).toContain('- task-1: done')
    expect(requests).toHaveLength(4)
    expect(requestText(requests[2])).toContain('previous response contained unexecuted DSML tool calls')
  })

  it('fails a worker after two DSML-only responses', async () => {
    const dsml = '<｜｜DSML｜｜tool_calls><｜｜DSML｜｜invoke name="glob" pattern="*"/></｜｜DSML｜｜tool_calls>'
    const responses = [
      '{"tasks":[{"id":"task-1","prompt":"fix","dependsOn":[],"files":[],"tokenBudget":10}],"acceptance":[]}',
      dsml,
      dsml,
    ]
    const requests: GenerateOptions[] = []
    const orchestrator = testOrchestrator(responses, requests)

    const result = await orchestrator.run(taskOptions())

    expect(result).toContain('Captain review stopped with findings.')
    expect(result).toContain('- task-1: failed (Error: worker task-1 returned unexecuted DSML tool calls)')
    expect(requests).toHaveLength(3)
  })

  it('does not call or trust a reviewer after a worker request fails', async () => {
    const requests: GenerateOptions[] = []
    const orchestrator = new CaptainOrchestrator(testContext(), testConfig, {
      stream: async function* (options) {
        requests.push(options)
        if (requests.length === 1) {
          yield { type: 'text-delta', index: 0, text: '{"tasks":[{"id":"task-1","prompt":"fix","dependsOn":[],"files":[],"tokenBudget":10}],"acceptance":[]}' }
          yield { type: 'finish', reason: { kind: 'stop' } }
          return
        }
        yield { type: 'finish', reason: { kind: 'error', failure: { message: 'worker failed', code: 'PROVIDER_ERROR' } } }
      },
    })

    const result = await orchestrator.run(taskOptions())

    expect(result).toContain('Captain review stopped with findings.')
    expect(result).toContain('- task-1: failed')
    expect(requests).toHaveLength(2)
  })

  it('retries one malformed reviewer response with a strict JSON correction', async () => {
    const responses = [
      '{"tasks":[{"id":"task-1","prompt":"fix","dependsOn":[],"files":[],"tokenBudget":10}],"acceptance":[]}',
      'Changed src/a.ts and focused tests passed.',
      'Looks good, ship it.',
      '{"pass":true,"summary":"accepted","findings":[]}',
    ]
    const requests: GenerateOptions[] = []
    const orchestrator = testOrchestrator(responses, requests)

    const result = await orchestrator.run(taskOptions())

    expect(result).toContain('Captain review passed.')
    expect(requests).toHaveLength(4)
    expect(requestText(requests[3])).toContain('Return exactly one JSON object')
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
  return { get: () => undefined, agents: { get: () => undefined } } as unknown as Context
}

function testOrchestrator(responses: string[], requests: GenerateOptions[]): CaptainOrchestrator {
  return new CaptainOrchestrator(testContext(), testConfig, {
    stream: async function* (options) {
      requests.push(options)
      const response = responses.shift()
      if (response === undefined) throw new Error('unexpected Captain request')
      yield { type: 'text-delta', index: 0, text: response }
      yield { type: 'finish', reason: { kind: 'stop' } }
    },
  })
}

function taskOptions(): GenerateOptions {
  return {
    provider: 'captain',
    model: 'captain:test',
    messages: [createUserMessage({ content: [{ type: 'text', text: 'fix the implementation' }], source: { kind: 'user' } })],
  }
}

function requestText(options: GenerateOptions): string {
  return options.messages.flatMap(message => message.content.flatMap(block => block.type === 'text' ? [block.text] : [])).join('\n')
}
