import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment';
import type { GenerateOptions, Message } from '@deepseek-ai/dsh-llm';
import type { CaptainRoleRoute } from './types.ts';
/** A provider-neutral image input accepted by the vision companion. */
export interface CaptainImageInput {
    ref: ImageAttachmentRef;
}
/** Append images to a user message without changing the text protocol. */
export declare function withImages(message: Message, images: readonly CaptainImageInput[]): Message;
/** Build a nested OpenAI-compatible vision request using the configured Luna/Terra route. */
export declare function visionRequest(route: CaptainRoleRoute, messages: Message[], images: readonly CaptainImageInput[]): GenerateOptions;
//# sourceMappingURL=vision.d.ts.map