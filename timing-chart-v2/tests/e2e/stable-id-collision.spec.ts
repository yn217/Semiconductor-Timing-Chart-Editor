import { expect, test } from "@playwright/test";

test("never generates a colliding Stable ID after a page reload resets the in-memory counter", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const tabs = page.locator(".ribbon-tabs");
  const ribbon = page.getByTestId("ribbon");

  const insertSignal = async () => {
    await tabs.getByRole("button", { name: "Insert", exact: true }).click();
    await ribbon.getByRole("button", { name: "Signal", exact: true }).click();
    await expect(host).toHaveAttribute("data-editor-idle", "true");
  };

  // Insert two signals, which claim signal_phase9_1 and signal_phase9_2.
  await insertSignal();
  await insertSignal();

  // Save the document (this is what will be reopened after "reload").
  const downloadPromise = page.waitForEvent("download");
  await tabs.getByRole("button", { name: "File", exact: true }).click();
  await ribbon.getByRole("button", { name: "Save", exact: true }).click();
  const path = await (await downloadPromise).path();

  // Simulate a fresh session: full page reload resets the module-level id counter to 0.
  await page.reload();
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator("input[type='file']").setInputFiles(path!);
  await expect(host).toHaveAttribute("data-editor-idle", "true");

  // Insert two more signals from this fresh, counter-reset session.
  await insertSignal();
  await insertSignal();

  // Every signal id in the final document must be unique — no collision with the
  // signal_phase9_1 / signal_phase9_2 ids created before the reload.
  await tabs.getByRole("button", { name: "Insert", exact: true }).click();
  await page.locator(".bottom-tabs").getByRole("button", { name: "JSON" }).click();
  const ids = await page.evaluate(() => {
    const pre = document.querySelector(".json-panel pre");
    const doc = JSON.parse(pre!.textContent!);
    return (doc.signals as { id: string }[]).map((signal) => signal.id);
  });
  expect(ids.length).toBe(new Set(ids).size);
  expect(ids.length).toBeGreaterThanOrEqual(12); // 8 demo signals + 4 inserted
});
