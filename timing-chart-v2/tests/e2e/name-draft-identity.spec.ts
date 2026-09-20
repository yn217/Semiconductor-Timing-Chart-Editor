import { expect, test } from "@playwright/test";
import { startInCycleMode } from "./cycle-startup.js";

startInCycleMode(test);

test("same-named Signal selection cannot transfer an uncommitted rename", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const select = async (id: string) => host.locator(`[data-role='frozen-row'][data-row-id='${id}']`).click();
  const input = page.getByTestId("inspector").getByLabel("Inspector signal name", { exact: true });
  for (const id of ["sig_cycle_request", "sig_cycle_ready"]) {
    await select(id);
    await expect(input).toHaveValue(id === "sig_cycle_request" ? "REQUEST" : "READY");
    await input.fill("SHARED_NAME");
    await input.press("Enter");
    await expect(input).toHaveValue("SHARED_NAME");
  }
  await select("sig_cycle_request");
  await input.fill("UNCOMMITTED_A");
  const history = await page.getByTestId("history-status").textContent();
  await select("sig_cycle_ready");
  await expect(input).toHaveValue("SHARED_NAME");
  await input.press("Enter");
  await expect(page.getByTestId("history-status")).toHaveText(history!);
  await expect(host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_ready']")).toContainText("SHARED_NAME");
  expect(errors).toEqual([]);
});
