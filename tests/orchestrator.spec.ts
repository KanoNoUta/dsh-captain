import { describe, expect, it } from 'vitest'
import { createAssistantMessage, createUserMessage } from '@deepseek-ai/dsh-llm'
import { collectText, currentTaskText, isConversationalTask } from '../src/orchestrator.ts'
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
