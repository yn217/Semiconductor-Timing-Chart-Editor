import { expect, test } from "@playwright/test";

test("clockless authoring restores geometry after deleting every signal", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  const ribbon = page.getByTestId("ribbon");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await ribbon.getByRole("button", { name: "New", exact: true }).click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
  await ribbon.getByRole("button", { name: "Select All Signals", exact: true }).click();
  await ribbon.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.locator(".editor-shell")).toHaveAttribute("data-signal-count", "0");
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await page.getByRole("button", { name: "Add signal or group", exact: true }).click();
  await page.getByRole("menu", { name: "Add signal or group" }).getByRole("menuitem", { name: "Clock", exact: true }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(page.getByTestId("time-axis-status")).toHaveText("Time Axis: Time · No Clock Reference");
  const ruler = page.getByTestId("cycle-ruler");
  const wave = host.locator("[data-role='wave-owner'] svg");
  await expect(wave).toHaveCount(1);
  await testInfo.attach("clockless-owner-boundary", { body: JSON.stringify({
    ruler: await ruler.evaluate((element) => ({ dataset: { ...((element as HTMLElement).dataset) }, width: element.getBoundingClientRect().width, ticks: element.querySelectorAll("[data-cycle]").length })),
    wave: await wave.evaluate((element) => ({ width: element.getBoundingClientRect().width, viewBox: element.getAttribute("viewBox"), parentStyle: element.parentElement?.getAttribute("style") })),
  }, null, 2), contentType: "application/json" });
  await expect(ruler.locator("[data-cycle='1']")).toHaveCount(1, { timeout: 3000 });
  expect((await wave.boundingBox())!.width).toBeGreaterThan(100);
  await page.getByRole("button", { name: "Add signal or group", exact: true }).click();
  await page.getByRole("menu", { name: "Add signal or group" }).getByRole("menuitem", { name: "Signal", exact: true }).click();
  const editor = page.getByTestId("signal-editor");
  await editor.getByLabel("New event start").fill("2");
  await editor.getByLabel("New event value").selectOption("1");
  await editor.getByTestId("add-signal-event").click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(wave).toHaveCount(2);
  for (const svg of await wave.all()) expect((await svg.boundingBox())!.width).toBeGreaterThan(100);
  await expect(ruler.locator("[data-cycle='2']")).toHaveCount(1);
  await expect(page.getByTestId("time-axis-status")).toHaveText("Time Axis: Time · No Clock Reference");
});
