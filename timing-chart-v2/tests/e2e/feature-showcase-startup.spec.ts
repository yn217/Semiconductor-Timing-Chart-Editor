import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

for (const viewport of [{ width: 1672, height: 941 }, { width: 1280, height: 720 }]) {
  test(`normal startup Feature Showcase is canonical and roundtrips at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    test.setTimeout(60_000);
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.setViewportSize(viewport);
    await page.goto("/");
    const host = page.getByTestId("cycle-surface");
    await expect(host).toHaveAttribute("data-editor-idle", "true");
    await expect(host).toHaveAttribute("data-canonical-revision", "0");
    await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
    await expect(page.getByTestId("dirty-status")).toHaveText("Clean");
    await expect(page.getByTestId("problems-status")).toHaveText("Problems: 0");
    await expect(page.getByTestId("wavedrom-status")).toHaveText("WaveDrom: Ready");
    await expect(page.locator(".editor-shell")).toHaveAttribute("data-signal-count", "8");
    await expect(page.locator(".editor-shell")).toHaveAttribute("data-transaction-count", "6");

    await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
    await expect(page.getByTestId("view-mode-status")).toHaveText("Mode: Cycle");
    await expect(host.locator("[data-role='stable-waveform-surface']").first()).toBeVisible();
    for (const label of ["CLOCK", "REQUEST", "DATA[7:0]"]) await expect(host).toContainText(label);
    await page.getByRole("tab", { name: "Annotation", exact: true }).click();
    await expect(page.locator("[data-annotation-row]")).toHaveCount(16);
    await page.getByRole("tab", { name: "Bookmarks", exact: true }).click();
    await expect(page.locator("[data-testid^='bookmark-row-']")).toHaveCount(5);

    await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
    await expect(page.getByTestId("view-mode-status")).toHaveText("Mode: Transaction");
    await expect(page.getByTestId("transaction-left-tree")).toContainText("Memory");
    await expect(page.getByTestId("transaction-left-tree")).toContainText("CPU");
    await expect(page.getByTestId("transaction-left-tree")).toContainText("Peripheral");
    await expect(page.locator("[data-transaction-row-id]")).toHaveCount(6);
    await expect(page.getByTestId("transaction-lanes")).toContainText("Read_0");
    const transactionBars = page.getByTestId("transaction-lanes").locator("[data-transaction-id]");
    await expect(transactionBars).toHaveCount(6);
    for (const bar of await transactionBars.all()) {
      await expect(bar).toBeVisible();
      await expect.poll(async () => bar.evaluate((element) => element.getBoundingClientRect().width)).toBeGreaterThan(0);
    }
    const readTransactionBar = page.getByTestId("transaction-lanes").locator("[data-transaction-id='demo_txn_read']");
    await expect(readTransactionBar).toBeVisible();
    await expect(readTransactionBar.locator("[data-phase-segment]")).toHaveCount(3);
    await expect(readTransactionBar).toContainText("Address");

    await page.locator(".view-mode").getByRole("button", { name: "Combined", exact: true }).click();
    await expect(page.getByTestId("view-mode-status")).toHaveText("Mode: Combined");
    await expect(page.locator(".split-transaction-pane")).toBeVisible();
    await expect(page.locator(".split-transaction-pane")).toContainText("Read_0");
    await expect(page.locator(".split-signal-content")).toContainText("REQUEST");
    await expect(host).toHaveAttribute("data-canonical-revision", "0");
    await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
    await expect(page.getByTestId("dirty-status")).toHaveText("Clean");

    await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
    const pendingDownload = page.waitForEvent("download");
    await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
    const savedPath = await (await pendingDownload).path();
    expect(savedPath).toBeTruthy();
    const saved = JSON.parse(await readFile(savedPath!, "utf8")) as {
      formatVersion: number;
      document: { id: string };
      signals: readonly { id: string }[];
      transactions: readonly { id: string; phases?: readonly unknown[]; linkedSignals?: readonly string[] }[];
      annotations: readonly { id: string }[];
      bookmarks: readonly { id: string; start: number }[];
    };
    expect(saved.formatVersion).toBe(2);
    expect(saved.document.id).toBe("transaction-demo");
    expect(saved.signals.map((item) => item.id)).toEqual(expect.arrayContaining(["sig_cycle_clock", "sig_cycle_data", "sig_cycle_state"]));
    expect(saved.transactions).toHaveLength(6);
    expect(saved.transactions.map((item) => item.id)).toEqual(expect.arrayContaining(["demo_txn_read", "demo_txn_write", "demo_txn_fetch", "demo_txn_execute", "demo_txn_spi", "demo_txn_other"]));
    expect(saved.transactions.find((item) => item.id === "demo_txn_read")).toMatchObject({ phases: expect.arrayContaining([expect.objectContaining({ name: "Address" })]), linkedSignals: ["sig_cycle_data", "sig_cycle_result"] });
    expect(saved.annotations).toHaveLength(16);
    expect(saved.annotations.map((item) => item.id)).toContain("demo_ann_marker");
    expect(saved.bookmarks).toHaveLength(5);
    expect(saved.bookmarks.map((item) => item.start)).toEqual([4, 10, 12, 28, 52]);

    await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(savedPath!);
    await expect(host).toHaveAttribute("data-editor-idle", "true");
    await expect(page.getByTestId("wavedrom-status")).toHaveText("WaveDrom: Ready");
    await expect(page.getByTestId("problems-status")).toHaveText("Problems: 0");
    await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
    await expect(page.getByTestId("dirty-status")).toHaveText("Clean");
    await expect(page.locator(".editor-shell")).toHaveAttribute("data-signal-count", "8");
    await expect(page.locator(".editor-shell")).toHaveAttribute("data-transaction-count", "6");
    await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
    const reopenedTransactionBars = page.getByTestId("transaction-lanes").locator("[data-transaction-id]");
    await expect(reopenedTransactionBars).toHaveCount(6);
    await expect(page.getByTestId("transaction-lanes").locator("[data-transaction-id='demo_txn_read'] [data-phase-segment]")).toHaveCount(3);
    await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
    await expect(page.getByTestId("view-mode-status")).toHaveText("Mode: Cycle");
    await page.getByRole("tab", { name: "Annotation", exact: true }).click();
    await expect(page.locator("[data-annotation-row]")).toHaveCount(16);
    await page.getByRole("tab", { name: "Bookmarks", exact: true }).click();
    await expect(page.locator("[data-testid^='bookmark-row-']")).toHaveCount(5);
    await expect(page.locator(".view-mode").getByRole("button", { name: "Combined", exact: true })).toBeVisible();
    expect(pageErrors).toEqual([]);
  });
}

test("showcase Transaction bars stay aligned with Cycle boundaries through horizontal scroll and mode roundtrip", async ({ page }) => {
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();

  const bar = page.getByTestId("transaction-lanes").locator("[data-transaction-id='demo_txn_fetch']");
  const cycleBoundary = page.locator(".cycle-tick[data-source-cycle='15']");
  await expect(bar).toBeVisible();
  await expect(cycleBoundary).toHaveCount(1);
  const viewport = page.locator(".cycle-viewport").first();
  await expect.poll(() => viewport.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeGreaterThan(0);

  const alignmentDelta = async () => {
    const [barBox, tickBox] = await Promise.all([bar.boundingBox(), cycleBoundary.boundingBox()]);
    expect(barBox).not.toBeNull();
    expect(tickBox).not.toBeNull();
    return Math.abs(barBox!.x - tickBox!.x);
  };
  await expect.poll(alignmentDelta).toBeLessThanOrEqual(1);

  await viewport.hover();
  await page.mouse.wheel(600, 0);
  await expect.poll(() => viewport.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  await expect.poll(alignmentDelta).toBeLessThanOrEqual(1);

  await page.locator(".view-mode").getByRole("button", { name: "Combined", exact: true }).click();
  await expect(page.locator(".split-transaction-pane").locator("[data-transaction-id='demo_txn_fetch']")).toBeVisible();
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await expect(bar).toBeVisible();
  await expect.poll(alignmentDelta).toBeLessThanOrEqual(1);
});
