/** True for a plain JSON object (not null, not an array), so its keys can be read safely. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
