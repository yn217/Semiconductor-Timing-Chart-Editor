/** File name offered by Save: the title with characters no common file system accepts replaced, no doubled `.tcd`, never empty or over-long. */
export function documentFilename(title: string | undefined, extension = ".tcd"): string {
  const withoutExtension = (title ?? "").replace(/\.tcd$/i, "");
  // eslint-disable-next-line no-control-regex
  const cleaned = withoutExtension.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").replace(/\s+/g, " ").replace(/^[\s.]+|[\s.]+$/g, "");
  const base = Array.from(cleaned).slice(0, 120).join("") || "timing-chart";
  return `${base}${extension}`;
}
