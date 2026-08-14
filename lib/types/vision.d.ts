import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment';
import type { GenerateOptions, LlmModelInfo, Message } from '@deepseek-ai/dsh-llm';
import type { CaptainRoleRoute } from './types.ts';
/** A provider-neutral image input accepted by the vision companion. */
export interface CaptainImageInput {
    ref: ImageAttachmentRef;
}
/** Append images to a user message without changing the text protocol. */
export declare function withImages(message: Message, images: readonly CaptainImageInput[]): Message;
/** Build a nested OpenAI-compatible vision request using the configured Luna/Terra route. */
export declare function visionRequest(route: CaptainRoleRoute, messages: Message[], images: readonly CaptainImageInput[]): GenerateOptions;
/**
 * Resolve an image-capable route without sending the original attachment to a text-only planner.
 * @param route - User-selected vision route.
 * @param models - Models advertised by the selected provider.
 * @returns The selected route or a same-provider image route, always using the provider's default effort.
 */
export declare function resolveVisionRoute(route: CaptainRoleRoute, models: readonly LlmModelInfo[]): CaptainRoleRoute;
//# sourceMappingURL=vision.d.ts.map