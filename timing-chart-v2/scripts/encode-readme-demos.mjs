import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const names = process.argv.slice(2);
if (!names.length) throw new Error("Specify captured demo names, e.g. transaction-view.");
const ffmpeg = process.env.FFMPEG_PATH ?? "ffmpeg";
for (const name of names) {
  if (!/^[a-z][a-z-]+$/.test(name)) throw new Error(`Invalid demo name: ${name}`);
  const input = resolve("artifacts/readme-demo-capture", `${name}.webm`);
  const output = resolve("docs/assets/demo", `${name}.gif`);
  statSync(input);
  const metadata = JSON.parse(readFileSync(resolve("artifacts/readme-demo-capture", `${name}.json`), "utf8"));
  if (!Number.isFinite(metadata.trimStartSeconds) || metadata.trimStartSeconds < 0 || metadata.errors?.length !== 0) throw new Error(`Invalid or failed capture metadata: ${name}`);
  mkdirSync(resolve("docs/assets/demo"), { recursive: true });
  // One graph produces and consumes a per-video palette; no low-quality default GIF palette.
  const result = spawnSync(ffmpeg, ["-n", "-ss", String(metadata.trimStartSeconds), "-i", input, "-filter_complex",
    "fps=12,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=sierra2_4a",
    "-loop", "0", output], { stdio: "inherit", windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Encoding failed for ${name}; existing GIFs are never overwritten.`);
  console.log(`${name}: ${statSync(output).size} bytes; ${metadata.viewport.width}×${metadata.viewport.height} capture, 12 fps. Review before embedding.`);
}
