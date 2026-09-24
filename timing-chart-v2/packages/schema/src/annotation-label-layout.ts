export const ANNOTATION_LABEL_MAX_WIDTH = Object.freeze({ min: 24, max: 2000, default: 180 });

/** Deterministic approximate text wrapping shared by the live overlay and
 * ExportScene. It preserves authored newlines, wraps at word boundaries,
 * and splits only a single overlong token when necessary. */
export function wrapAnnotationLabel(label: string, maxWidth: number, fontSize = 10): string {
  const width = Number.isFinite(maxWidth) ? Math.max(ANNOTATION_LABEL_MAX_WIDTH.min, Math.min(ANNOTATION_LABEL_MAX_WIDTH.max, maxWidth)) : ANNOTATION_LABEL_MAX_WIDTH.default;
  const size = Number.isFinite(fontSize) && fontSize > 0 ? fontSize : 10;
  const measure = (text: string) => [...text].reduce((sum, character) => sum + (/[\u2e80-\u9fff\uf900-\ufaff]/u.test(character) ? 1 : character === " " ? 0.33 : /[ilI.,'`:;!|]/u.test(character) ? 0.3 : /[MW@#%&]/u.test(character) ? 0.85 : 0.55) * size, 0);
  return label.split("\n").map((paragraph) => {
    const words = paragraph.split(/(\s+)/u).filter(Boolean);
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
      if (/^\s+$/u.test(word)) {
        if (line) line += word;
        continue;
      }
      const candidate = line + word;
      if (!line || measure(candidate.trimEnd()) <= width) { line = candidate; continue; }
      lines.push(line.trimEnd());
      line = "";
      if (measure(word) <= width) { line = word; continue; }
      let fragment = "";
      for (const character of word) {
        if (fragment && measure(fragment + character) > width) { lines.push(fragment); fragment = character; }
        else fragment += character;
      }
      line = fragment;
    }
    if (line || lines.length === 0) lines.push(line.trimEnd());
    return lines.join("\n");
  }).join("\n");
}
