import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import type { ContentBlock, GenerateOptions, LlmModelInfo, Message } from '@deepseek-ai/dsh-llm'
import type { CaptainRoleRoute } from './types.ts'
import { visionModelRank } from './vision-model.ts'

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
  }
}

/**
 * Resolve an image-capable route without sending the original attachment to a text-only planner.
 * @param route - User-selected vision route.
 * @param models - Models advertised by the selected provider.
 * @returns The selected route or a same-provider image route, always using the provider's default effort.
 */
export function resolveVisionRoute(
  route: CaptainRoleRoute,
  models: readonly LlmModelInfo[],
): CaptainRoleRoute {
  const selected = models.find(model => model.id === route.model)
  if (selected === undefined || selected.inputModalities === undefined || selected.inputModalities.includes('image')) {
    return { ...route, reasoningEffort: '' }
  }

  const fallback = models
    .filter(model => model.inputModalities?.includes('image') === true)
    .toSorted((left, right) => visionModelRank(left.id) - visionModelRank(right.id))[0]
  if (fallback !== undefined) return { provider: route.provider, model: fallback.id, reasoningEffort: '' }

  throw new Error(
    `Captain vision provider "${route.provider}" has no image-capable model; declare a Luna/Terra model with input: [text, image]`,
  )
}
