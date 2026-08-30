import { browserHealthFindings, runMechanicalDiagnostics } from "./mechanical-diagnostics.mjs";

/** Build a stable, serialisable bundle manifest for human/AI visual review. */
export function createAiReviewBundle({ gitHead, scenario, viewport, dpr = 1, actions = [], images = {}, crops = [], diagnostics = { findings: [] }, expectedChange = [], stableRegions = [] }) {
  if (!gitHead || !scenario || !Array.isArray(viewport) || viewport.length !== 2) throw new Error("gitHead, scenario, and viewport [width,height] are required");
  return {
    schemaVersion: 1,
    testedCommit: gitHead,
    scenario,
    capture: { viewport: [...viewport], dpr },
    actions: [...actions],
    images: { before: images.before ?? null, current: images.current ?? null, reference: images.reference ?? null },
    crops: [...crops],
    diagnostics,
    expectedChange: [...expectedChange],
    stableRegions: [...stableRegions],
    reviewInstructions: [
      "Check visual crowding and hierarchy consistency beyond numeric findings.",
      "Check for ghost, doubled, blurred, or uneven text and icons.",
      "Check excessive whitespace and waveform/annotation readability.",
      "Check for changes outside the intended interaction scope.",
    ],
  };
}

export async function writeAiReviewBundle(path, bundle, writeFile = (file, contents) => import("node:fs/promises").then(({ writeFile: save }) => save(file, contents))) {
  if (!bundle?.testedCommit || !bundle?.scenario) throw new Error("A valid AI review bundle is required");
  await writeFile(path, `${JSON.stringify(bundle, null, 2)}\n`);
  return path;
}

export async function captureScenarioReview({ page, scenario, gitHead, viewport, rules, actions = [], images = {}, crops = [], expectedChange = [], stableRegions = [], outputPath }) {
  const consoleErrors = []; const pageErrors = []; const failedResources = [];
  const onConsole = (message) => { if (message.type() === "error") consoleErrors.push(message.text()); };
  const onPageError = (error) => pageErrors.push(String(error));
  const onResponse = (response) => { if (response.status() >= 400) failedResources.push(response.url()); };
  page.on("console", onConsole); page.on("pageerror", onPageError); page.on("response", onResponse);
  const metrics = await page.evaluate((inputRules) => inputRules.flatMap((rule) => [...document.querySelectorAll(rule.selector)].map((node) => { const rect = node.getBoundingClientRect(); const icon = rule.iconSelector ? node.querySelector(rule.iconSelector)?.getBoundingClientRect() : undefined; const label = rule.labelSelector ? node.querySelector(rule.labelSelector)?.getBoundingClientRect() : undefined; return { target: rule.target ?? rule.selector, text: node.textContent?.trim() ?? "", clientWidth: node.clientWidth, scrollWidth: node.scrollWidth, clientHeight: node.clientHeight, scrollHeight: node.scrollHeight, rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }, ...(icon ? { iconRect: { left: icon.left, right: icon.right, top: icon.top, bottom: icon.bottom }, buttonRect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom } } : {}), ...(label ? { baselineGroup: rule.baselineGroup ?? rule.target ?? rule.selector, baselineY: label.bottom } : {}) }; })), rules);
  page.removeListener("console", onConsole); page.removeListener("pageerror", onPageError); page.removeListener("response", onResponse);
  const diagnostics = { scenario, findings: runMechanicalDiagnostics({ scenario, elements: metrics, evidence: Object.values(images).filter(Boolean) }) .findings.concat(browserHealthFindings({ scenario, consoleErrors, pageErrors, failedResources, evidence: Object.values(images).filter(Boolean) })) };
  const bundle = createAiReviewBundle({ gitHead, scenario, viewport, actions, images, crops, diagnostics, expectedChange, stableRegions });
  if (outputPath) await writeAiReviewBundle(outputPath, bundle);
  return bundle;
}
