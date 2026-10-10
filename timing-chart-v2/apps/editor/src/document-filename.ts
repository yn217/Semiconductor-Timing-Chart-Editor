// Windows treats the part before the first dot as the device name (`nul.txt` is still NUL), case-insensitively.
const WINDOWS_RESERVED_STEM = /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?=\.|$)/i;

/** File name offered by Save: the title with characters no common file system accepts replaced, no doubled `.tcd`, never empty, over-long, or a Windows device name. */
export function documentFilename(title: string | undefined, extension = ".tcd"): string {
  const withoutExtension = (title ?? "").replace(/\.tcd$/i, "");
  // eslint-disable-next-line no-control-regex
  const cleaned = withoutExtension.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").replace(/\s+/g, " ").replace(/^[\s.]+|[\s.]+$/g, "");
  // Suffix the device stem before clamping: the "_" survives the clamp, so the result can never reserve a device name again.
  const reserved = WINDOWS_RESERVED_STEM.exec(cleaned)?.[0];
  const guarded = reserved === undefined ? cleaned : `${reserved}_${cleaned.slice(reserved.length)}`;
  const base = Array.from(guarded).slice(0, 120).join("") || "timing-chart";
  return `${base}${extension}`;
}
