import { parseDocument } from "@timing-chart-v2/schema";

/** Pure Open boundary: parsing/migration stays independent of the editor shell. */
export function parseOpenDocument(text: string): ReturnType<typeof parseDocument> {
  return parseDocument(text);
}
