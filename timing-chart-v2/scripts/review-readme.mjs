import { chromium } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { createServer } from "node:http";

const root = resolve("..");
const markdown = await readFile(resolve(root, "README.md"), "utf8");
// gh supplies its existing authentication without exposing a token to the browser.
const rendered = spawnSync("gh", ["api", "markdown", "--input", "-"], {
  input: JSON.stringify({ text: markdown, mode: "gfm", context: "yn217/Semiconductor-Timing-Chart-Editor" }),
  encoding: "utf8", windowsHide: true,
});
if (rendered.status !== 0) throw new Error(`GitHub Markdown render failed: ${rendered.stderr}`);
const html = `<!doctype html><meta charset="utf-8"><title>README review</title>
<style>body{margin:0;font:16px/1.6 system-ui;background:white;color:#1f2328}article{box-sizing:border-box;max-width:1012px;margin:auto;padding:24px}img{max-width:100%;height:auto}pre{overflow:auto;background:#f6f8fa;padding:16px}table{display:block;overflow:auto}h1,h2{border-bottom:1px solid #d1d9e0;padding-bottom:.3em}a{color:#0969da}@media(max-width:600px){article{padding:16px}}</style>
<article>${rendered.stdout}</article>`;
const output = resolve("artifacts/readme-review");
await mkdir(output, { recursive: true });
await writeFile(resolve(output, "github-rendered-readme.html"), html);
const server = createServer(async (request, response) => {
  try {
    if (request.url === "/") { response.setHeader("Content-Type", "text/html; charset=utf-8"); response.end(html); return; }
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname).replace(/^\/+/, "");
    const file = resolve(root, pathname);
    if (!file.startsWith(root + sep) || !file.endsWith(".gif")) { response.writeHead(404).end(); return; }
    response.setHeader("Content-Type", "image/gif");
    response.end(await readFile(file));
  } catch { response.writeHead(404).end(); }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const browser = await chromium.launch({ headless: true });
try {
  const records = [];
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const images = page.locator("article img");
    if (await images.count() !== 8) throw new Error("Expected eight demo images.");
    for (const image of await images.all()) {
      await image.evaluate((element) => element.decode());
      const size = await image.evaluate((element) => ({ natural: element.naturalWidth, width: element.getBoundingClientRect().width }));
      if (size.natural !== 1440 || size.width <= 0 || size.width > width) throw new Error(JSON.stringify(size));
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    if (overflow) throw new Error(`Horizontal document overflow at ${width}px.`);
    await page.screenshot({ path: resolve(output, `readme-${width}.png`), fullPage: true });
    records.push({ width, images: 8, horizontalOverflow: overflow });
    console.log(`${width}px: eight GIFs decoded, no horizontal overflow.`);
    await page.close();
  }
  await writeFile(resolve(output, "result.json"), JSON.stringify({ renderer: "GitHub GFM API", styling: "local responsive review CSS, not GitHub site CSS", records }, null, 2));
} finally {
  await browser.close();
  await new Promise((done) => server.close(done));
}
