import { describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { AttachmentId } from '@deepseek-ai/dsh-attachment'
import { createAssistantMessage, createUserMessage, type GenerateOptions } from '@deepseek-ai/dsh-llm'
import { CaptainOrchestrator, collectText, currentTaskText, isConversationalTask, isImageAnalysisTask } from '../src/orchestrator.ts'
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
})
