import { expect, test } from "@playwright/test";

test("a pristine binary Signal Generator is not presented as an unapplied user Draft", async ({ page }) => {
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.addInitScript(() => localStorage.clear());
  await page.goto("/");
  const surface = page.getByTestId("cycle-surface");
  await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await page.getByRole("tab", { name: "Signal", exact: true }).click();

  const revision = await surface.getAttribute("data-canonical-revision");
  const history = await page.getByTestId("history-status").innerText();
  const dirty = await page.getByTestId("dirty-status").innerText();
  await surface.locator("[data-role='frozen-row'][data-row-id='sig_cycle_reset_n']").click();

  const generator = page.getByTestId("signal-editor").locator("form[aria-label='Signal Generator']");
  const status = generator.getByTestId("signal-generator-unapplied");
  const start = generator.getByLabel("Signal generator start");
  const cancel = generator.getByTestId("cancel-signal-generator");
  const generate = generator.getByTestId("apply-signal-generator");
  const disclosure = page.getByTestId("signal-editor").getByTestId("signal-generator-disclosure");
  if ((await disclosure.getAttribute("aria-expanded")) !== "true") await disclosure.click();
  await expect(generator).toBeVisible();
  await expect(status).toHaveCount(0);
  await expect(cancel).toBeDisabled();
  await expect(generate).toBeEnabled();

  await start.fill("1");
  await expect(status).toBeVisible();
  await expect(cancel).toBeEnabled();
  await expect(generate).toBeEnabled();
  await expect(surface).toHaveAttribute("data-canonical-revision", revision!);
  await expect(page.getByTestId("history-status")).toHaveText(history);
  await expect(page.getByTestId("dirty-status")).toHaveText(dirty);

  await cancel.click();
  await expect(start).toHaveValue("0");
  await expect(status).toHaveCount(0);
  await expect(cancel).toBeDisabled();
  await surface.locator("[data-role='frozen-row'][data-row-id='sig_cycle_ready']").click();
  await expect(generator.getByLabel("Signal generator start")).toHaveValue("0");
  await expect(status).toHaveCount(0);
  await expect(cancel).toBeDisabled();
  await expect(surface).toHaveAttribute("data-canonical-revision", revision!);
  await expect(page.getByTestId("history-status")).toHaveText(history);
  await expect(page.getByTestId("dirty-status")).toHaveText(dirty);
});
