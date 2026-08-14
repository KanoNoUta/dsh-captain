import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import type { ContentBlock, GenerateOptions, Message } from '@deepseek-ai/dsh-llm'
import type { CaptainRoleRoute } from './types.ts'

/** A provider-neutral image input accepted by the vision companion. */
export interface CaptainImageInput {
  ref: ImageAttachmentRef
}

/** Append images to a user message without changing the text protocol. */
export function withImages(message: Message, images: readonly CaptainImageInput[]): Message {
  if (message.role !== 'user') throw new Error('Captain vision input must be attached to a user message')
  const content: ContentBlock[] = [...message.content]
  for (const image of images) {
    content.push({ type: 'image', attachment: image.ref })
  }
  return { ...message, content }
}

/** Build a nested OpenAI-compatible vision request using the configured Luna/Terra route. */
export function visionRequest(route: CaptainRoleRoute, messages: Message[], images: readonly CaptainImageInput[]): GenerateOptions {
  const last = messages.at(-1)
  const next = last === undefined ? messages : messages.slice(0, -1).concat(withImages(last, images))
  return {
    provider: route.provider,
    model: route.model,
    messages: next,
    ...route.reasoningEffort === '' ? {} : { reasoningEffort: route.reasoningEffort as never },
  }
}
