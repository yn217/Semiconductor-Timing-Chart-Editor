import { expect, test, type Page } from "@playwright/test";
import { generatePerformanceDocument } from "@timing-chart-v2/testing";

/**
 * #431 sections 18-19: the Protocol and Stability timing checks can each be switched off and on from the Check tab. A Handshake whose ACK never
 * comes (Protocol: HANDSHAKE_NO_ACK) and whose payload changes while waiting (Stability: HANDSHAKE_DATA_UNSTABLE) appears in Problems, each
 * finding disappears when its own category is OFF, and the same findings return when it is ON again (deterministic). Records the observed persistence policy: the toggle is a document check setting.
 */
const sizes = [{ width: 1280, height: 720 }, { width: 1672, height: 941 }] as const;

function handshakeDocument() {
  const base = generatePerformanceDocument({ signalCount: 4, cycleCount: 24, profile: "standard" });
  const proto = base.signals[1]!;
  const request = { ...proto, id: "sig_req", name: "REQ", type: "binary", values: [{ start: 0, value: 0 }, { start: 2, value: 1 }] };
  const acknowledge = { ...proto, id: "sig_ack", name: "ACK", type: "binary", values: [{ start: 0, value: 0 }] };
  const payload = { ...proto, id: "sig_payload", name: "PAYLOAD", type: "bus", values: [{ start: 0, value: "00" }, { start: 3, value: "01" }] };
  const request2 = { ...proto, id: "sig_req2", name: "REQ2", type: "binary", values: [{ start: 0, value: 0 }, { start: 2, value: 1 }] };
  const acknowledge2 = { ...proto, id: "sig_ack2", name: "ACK2", type: "binary", values: [{ start: 0, value: 0 }, { start: 5, value: 1 }] };
  const signals = [base.signals[0]!, request, acknowledge, payload, request2, acknowledge2] as unknown as typeof base.signals;
  return { ...base, signals, signalGroups: [{ ...base.signalGroups[0]!, rows: signals.map((signal) => signal.id) }], constraints: [{ id: "constraint_handshake", type: "handshake", data: { requestSignalId: "sig_req", acknowledgeSignalId: "sig_ack", stableSignalIds: [] } }, { id: "constraint_handshake2", type: "handshake", data: { requestSignalId: "sig_req2", acknowledgeSignalId: "sig_ack2", stableSignalIds: ["sig_payload"] } }] };
}

const summary = async (page: Page) => (await page.getByTestId("review-summary").textContent())!.trim();

for (const size of sizes) {
  test(`Protocol check ON/OFF/ON through the Check tab is deterministic at ${size.width}x${size.height}`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize(size);
    await page.goto("/");
    const surface = page.getByTestId("cycle-surface");
    await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
    await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "protocol431.tcd.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(handshakeDocument())) });
    await expect(page.locator(".editor-shell")).toHaveAttribute("data-signal-count", "6", { timeout: 60_000 });
    await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
    await page.getByRole("button", { name: "Check", exact: true }).click();
    const count = async () => Number(/^(\d+) of (\d+)/.exec(await summary(page))![2]);
    await expect.poll(count, { message: "the Handshake findings are reported" }).toBeGreaterThanOrEqual(2);
    const all = await summary(page);
    const full = await count();
    const revision = await surface.getAttribute("data-canonical-revision");
    for (const category of ["protocol", "stability"] as const) {
      const box = page.getByTestId(`review-check-${category}`);
      await expect(box).toBeChecked();
      await box.uncheck();
      await expect(box).not.toBeChecked();
      await expect.poll(count, { message: `${category} OFF removes its own findings` }).toBeLessThan(full);
      await box.check();
      await expect(box).toBeChecked();
      await expect.poll(() => summary(page), { message: `same findings return after re-enabling ${category} (no duplicates)` }).toBe(all);
    }

    // Persistence policy as observed: the category list is document check settings (a document property edit), so the toggle is a recorded edit.
    console.log("E431-PROTOCOL", JSON.stringify({ size, all, revisionBefore: revision, revisionAfter: await surface.getAttribute("data-canonical-revision"), history: await page.getByTestId("history-status").textContent(), dirty: await page.getByTestId("dirty-status").textContent() }));
  });
}
