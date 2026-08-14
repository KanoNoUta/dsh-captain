import { describe, expect, it } from 'vitest'
import { AttachmentId } from '@deepseek-ai/dsh-attachment'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { resolveVisionRoute, visionRequest, withImages } from '../src/vision.ts'

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
    expect(request).not.toHaveProperty('reasoningEffort')
    expect(request.messages[0]?.content.at(-1)).toEqual({ type: 'image', attachment: image })
  })

  it('falls back from a text-only planner model to the same provider Terra route', () => {
    expect(resolveVisionRoute(
      { provider: 'gpt-relay', model: 'gpt-5.6-sol', reasoningEffort: 'medium' },
      [
        { provider: 'gpt-relay', id: 'gpt-5.6-sol', name: 'Sol', inputModalities: ['text'] },
        { provider: 'gpt-relay', id: 'gpt-5.6-luna', name: 'Luna', inputModalities: ['text', 'image'] },
        { provider: 'gpt-relay', id: 'gpt-5.6-terra', name: 'Terra', inputModalities: ['text', 'image'] },
      ],
    )).toEqual({ provider: 'gpt-relay', model: 'gpt-5.6-terra', reasoningEffort: '' })
  })

  it('keeps an image-capable configured route and removes its effort', () => {
    expect(resolveVisionRoute(
      { provider: 'gpt-relay', model: 'gpt-5.6-luna', reasoningEffort: 'high' },
      [{ provider: 'gpt-relay', id: 'gpt-5.6-luna', name: 'Luna', inputModalities: ['text', 'image'] }],
    )).toEqual({ provider: 'gpt-relay', model: 'gpt-5.6-luna', reasoningEffort: '' })
  })

  it('preserves a route whose provider does not disclose modalities', () => {
    expect(resolveVisionRoute(
      { provider: 'custom', model: 'custom-vision', reasoningEffort: 'high' },
      [{ provider: 'custom', id: 'custom-vision', name: 'Custom Vision' }],
    )).toEqual({ provider: 'custom', model: 'custom-vision', reasoningEffort: '' })
  })

  it('reports a provider with no declared image model before dispatch', () => {
    expect(() => resolveVisionRoute(
      { provider: 'gpt-relay', model: 'gpt-5.6-sol', reasoningEffort: '' },
      [{ provider: 'gpt-relay', id: 'gpt-5.6-sol', name: 'Sol', inputModalities: ['text'] }],
    )).toThrow('declare a Luna/Terra model with input: [text, image]')
  })
})
