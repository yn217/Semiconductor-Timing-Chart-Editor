import { expect, test } from "@playwright/test";
import { runMechanicalDiagnostics } from "../../harness/gui/mechanical-diagnostics.mjs";

test("browser diagnostics detect injected clipping, overlap, duplication, and icon drift", async ({ page }) => {
  await page.setContent(`<style>
    .clip { width: 20px; overflow: hidden; white-space: nowrap; }
    .box { position: absolute; width: 40px; height: 20px; }
  </style><div class="clip">This label is clipped</div><div class="box one">Duplicate</div><div class="box two">Duplicate</div><button class="icon-drift"><span>Icon</span></button>`);
  const elements = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>(".clip, .box, .icon-drift")].map((node) => {
    const rect = node.getBoundingClientRect();
    return { target: node.className, text: node.textContent?.trim() ?? "", clientWidth: node.clientWidth, scrollWidth: node.scrollWidth, clientHeight: node.clientHeight, scrollHeight: node.scrollHeight, rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }, ...(node.className === "icon-drift" ? { iconRect: { left: 0, right: 4 }, buttonRect: { left: 20, right: 80 } } : {}) };
  }));
  const result = runMechanicalDiagnostics({ scenario: "INJECTED-NEGATIVE", elements, evidence: ["in-memory-fixture"] });
  expect(new Set(result.findings.map((finding) => finding.category))).toEqual(new Set(["TEXT_CLIPPING", "OVERLAP", "DUPLICATION", "ICON_ALIGNMENT"]));
  expect(result.findings.every((finding) => finding.severity === "MAJOR" && finding.evidence.length === 1)).toBe(true);
});
