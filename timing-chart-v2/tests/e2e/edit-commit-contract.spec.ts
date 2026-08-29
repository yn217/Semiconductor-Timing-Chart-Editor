import { expect, test } from "@playwright/test";

test("Inspector and Bottom expose the documented edit contract surfaces", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  const inspector = page.getByTestId("inspector");
  await expect(inspector.getByLabel("Inspector signal name")).toBeVisible();
  await expect(inspector.getByTestId("apply-inspector-signal")).toBeVisible();
  await expect(inspector.getByLabel("Inspector signal visible")).toBeVisible();
  await expect(page.getByTestId("bottom-tabs").getByRole("button", { name: "Signal", exact: true })).toBeVisible();
  await expect(page.getByTestId("bottom-tabs").getByRole("button", { name: "Annotation", exact: true })).toBeVisible();
  await expect(page.getByTestId("bottom-tabs").getByRole("button", { name: "Problems", exact: true })).toBeVisible();
  await expect(page.getByTestId("bottom-tabs").getByRole("button", { name: "JSON", exact: true })).toBeVisible();
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await expect(page.getByTestId("bottom-tabs").getByRole("button", { name: "Transaction", exact: true })).toBeVisible();
  await expect(page.getByTestId("follow-selection")).toBeVisible();
  await expect(page.getByTestId("bottom-pin")).toBeVisible();
});

test("Inspector Cancel restores signal and clock drafts without a canonical mutation", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const revision = await host.getAttribute("data-canonical-revision");
  const history = await page.getByTestId("history-status").textContent();
  const dirty = await page.getByTestId("dirty-status").textContent();

  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  const signalInspector = page.getByTestId("inspector");
  const originalName = await signalInspector.getByLabel("Inspector signal name").inputValue();
  await signalInspector.getByLabel("Inspector signal name").fill("TRANSIENT_CANCELLED");
  await signalInspector.getByLabel("Inspector signal name").press("Escape");
  await expect(page.getByTestId("inspector").getByLabel("Inspector signal name")).toHaveValue(originalName);
  await expect(host).toHaveAttribute("data-canonical-revision", revision!);
  await expect(page.getByTestId("history-status")).toHaveText(history!);
  await expect(page.getByTestId("dirty-status")).toHaveText(dirty!);

  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_clock']").click();
  const clockInspector = page.getByTestId("inspector");
  const originalPeriod = await clockInspector.getByLabel("Inspector clock period").inputValue();
  await clockInspector.getByLabel("Inspector clock period").fill("99");
  await expect(clockInspector.getByTestId("cancel-inspector-draft")).toBeVisible();
  await clockInspector.getByTestId("cancel-inspector-draft").click();
  await expect(page.getByTestId("inspector").getByLabel("Inspector clock period")).toHaveValue(originalPeriod);
  await expect(host).toHaveAttribute("data-canonical-revision", revision!);
  await expect(page.getByTestId("history-status")).toHaveText(history!);
  await expect(page.getByTestId("dirty-status")).toHaveText(dirty!);
});
