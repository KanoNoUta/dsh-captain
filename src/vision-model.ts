/** Whether a model name is a likely dedicated vision route for selector filtering. */
export function isLikelyVisionModel(id: string): boolean {
  return /(?:^|[-_.])(luna|terra|vision|image|vl|omni)(?:$|[-_.])/i.test(id)
}

/** Rank image-capable models for automatic fallback. */
export function visionModelRank(id: string): number {
  if (/(?:^|[-_.])terra(?:$|[-_.])/i.test(id)) return 0
  if (/(?:^|[-_.])luna(?:$|[-_.])/i.test(id)) return 1
  return 2
}
