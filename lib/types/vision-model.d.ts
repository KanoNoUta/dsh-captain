/** Whether a model name is a likely dedicated vision route for selector filtering.
 * @param id - Model id to classify.
 * @returns True when the id contains a common image-capability marker.
 */
export declare function isLikelyVisionModel(id: string): boolean;
/** Rank image-capable models for automatic fallback.
 * @param id - Model id to rank.
 * @returns Lower values are preferred for automatic vision fallback.
 */
export declare function visionModelRank(id: string): number;
//# sourceMappingURL=vision-model.d.ts.map