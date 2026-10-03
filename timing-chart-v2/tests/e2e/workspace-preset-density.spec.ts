import { expect, test } from "@playwright/test";

test("workspace presets and density are discoverable view-only controls", async ({ page }) => {
  await page.goto("/");
  const shell = page.locator(".editor-shell");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await expect(host).toHaveAttribute("data-canonical-revision", /^\d+$/);

  const before = {
    revision: await host.getAttribute("data-canonical-revision"),
    history: await host.getAttribute("data-history-depth"),
    dirty: await page.getByTestId("dirty-status").textContent(),
  };

  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
  const workspace = page.getByLabel("Workspace preset");
  const density = page.getByLabel("UI density");
  await expect(workspace).toHaveValue("edit");
  await expect(density).toHaveValue("comfortable");

  await workspace.selectOption("waveform");
  await expect(shell).toHaveAttribute("data-workspace-preset", "waveform");
  await expect(shell).toHaveAttribute("data-inspector-visible", "false");
  await expect(shell).toHaveAttribute("data-bottom-visible", "false");
  await workspace.selectOption("review");
  await expect(shell).toHaveAttribute("data-workspace-preset", "review");
  await expect(shell).toHaveAttribute("data-inspector-visible", "true");
  await expect(shell).toHaveAttribute("data-bottom-visible", "true");
  await expect(page.locator(".bottom-tabs [data-bottom-tab='Problems']")).toHaveClass(/active/);
  await workspace.selectOption("transaction");
  await expect(shell).toHaveAttribute("data-workspace-preset", "transaction");
  await expect(page.locator(".bottom-tabs [data-bottom-tab='Transaction']")).toHaveClass(/active/);
  await density.selectOption("compact");
  await expect(shell).toHaveAttribute("data-density", "compact");
  await density.selectOption("comfortable");
  await expect(shell).toHaveAttribute("data-density", "comfortable");

  expect(await host.getAttribute("data-canonical-revision")).toBe(before.revision);
  expect(await host.getAttribute("data-history-depth")).toBe(before.history);
  expect(await page.getByTestId("dirty-status").textContent()).toBe(before.dirty);
});
