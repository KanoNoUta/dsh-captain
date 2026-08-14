import { describe, expect, it } from 'vitest'
import { AttachmentId } from '@deepseek-ai/dsh-attachment'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { visionRequest, withImages } from '../src/vision.ts'

const image = {
  attachmentId: AttachmentId('sha256:test'),
  mediaType: 'image/png' as const,
  bytes: 4,
  width: 1,
  height: 1,
}

describe('Captain vision companion', () => {
  it('appends durable image references to a user message', () => {
    const message = createUserMessage({ content: [{ type: 'text', text: 'inspect' }], source: { kind: 'user' } })
    expect(withImages(message, [{ ref: image }]).content).toEqual([
      { type: 'text', text: 'inspect' },
      { type: 'image', attachment: image },
    ])
  })

  it('routes the image request through the configured OpenAI-compatible model', () => {
    const message = createUserMessage({ content: [{ type: 'text', text: 'inspect' }], source: { kind: 'user' } })
    const request = visionRequest({ provider: 'gpt-relay', model: 'gpt-5.6-terra', reasoningEffort: 'high' }, [message], [{ ref: image }])
    expect(request.provider).toBe('gpt-relay')
    expect(request.model).toBe('gpt-5.6-terra')
    expect(request.messages[0]?.content.at(-1)).toEqual({ type: 'image', attachment: image })
  })
})
