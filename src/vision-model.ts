/** Whether a model name is a likely dedicated vision route for selector filtering.
 * @param id - Model id to classify.
 * @returns True when the id contains a common image-capability marker.
 */
export function isLikelyVisionModel(id: string): boolean {
  return /(?:^|[-_.])(luna|terra|vision|image|vl|omni)(?:$|[-_.])/i.test(id)
}

/** Rank image-capable models for automatic fallback.
 * @param id - Model id to rank.
 * @returns Lower values are preferred for automatic vision fallback.
 */
export function visionModelRank(id: string): number {
  if (/(?:^|[-_.])terra(?:$|[-_.])/i.test(id)) return 0
  if (/(?:^|[-_.])luna(?:$|[-_.])/i.test(id)) return 1
  return 2
}
