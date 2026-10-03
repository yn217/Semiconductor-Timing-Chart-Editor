import { expect, test } from "@playwright/test";
import { generatePerformanceDocument } from "@timing-chart-v2/testing";

function latencyViolationDocument() {
  const base = generatePerformanceDocument({ signalCount: 2, cycleCount: 24, profile: "standard" });
  const template = base.signals[1]!;
  const request = { ...template, id: "sig_req", name: "REQ", display: { ...template.display, name: "REQ" }, type: "binary", values: [{ start: 0, value: 0 }, { start: 2, value: 1 }] };
  const acknowledge = { ...template, id: "sig_ack", name: "ACK", display: { ...template.display, name: "ACK" }, type: "binary", values: [{ start: 0, value: 0 }, { start: 7, value: 1 }] };
  return {
    ...base,
    signals: [base.signals[0]!, request, acknowledge] as unknown as typeof base.signals,
    signalGroups: [{ ...base.signalGroups[0]!, rows: [base.signals[0]!.id, request.id, acknowledge.id] }],
    constraints: [{
      id: "constraint_req_ack_latency",
      type: "latency",
      data: { triggerSignalId: request.id, triggerEdge: "rising", responseSignalId: acknowledge.id, responseEdge: "rising", minCycles: 1, maxCycles: 3 },
    }],
  };
}

test("constraint Problem navigation reveals its stable Signal and offending source cycle", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  const surface = page.getByTestId("cycle-surface");
  await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({
    name: "constraint-problem-reveal.tcd.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(latencyViolationDocument())),
  });
  await expect(page.locator(".editor-shell")).toHaveAttribute("data-signal-count", "3");
  await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });

  await page.getByRole("button", { name: "Check", exact: true }).click();
  await page.getByTestId("review-open-problems").click();
  const problem = page.getByRole("button", { name: "LATENCY_OUT_OF_RANGE" });
  await expect(problem).toBeVisible();
  await problem.click();

  await expect(surface).toHaveAttribute("data-selected-signal-id", "sig_ack");
  await expect(surface).toHaveAttribute("data-selected-cycle", "7");
});
