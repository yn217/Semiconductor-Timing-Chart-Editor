import { expect, test } from "@playwright/test";

const viewports = [
  { width: 1672, height: 941 },
  { width: 1280, height: 720 },
];

async function openCycle(page: import("@playwright/test").Page, viewport: typeof viewports[number]) {
  await page.setViewportSize(viewport);
  await page.goto("/");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
}

for (const viewport of viewports) {
  test(`pinned Annotation retains collection routing and stable delete target at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    await openCycle(page, viewport);
    const host = page.getByTestId("cycle-surface");
    const bottom = page.getByTestId("bottom-editor");
    await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
    await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();
    await page.getByTestId("annotation-toolbar").getByRole("button", { name: "Add annotation", exact: true }).click();

    const list = bottom.getByTestId("annotation-list");
    const selectedRow = list.locator("[data-selected='true'][data-annotation-list-id]");
    await expect(selectedRow).toHaveCount(1);
    const pinnedId = await selectedRow.getAttribute("data-annotation-list-id");
    expect(pinnedId).toBeTruthy();
    const beforePin = {
      revision: await page.getByTestId("revision-status").textContent(),
      history: await page.getByTestId("history-status").textContent(),
      dirty: await page.getByTestId("dirty-status").textContent(),
    };

    await bottom.getByTestId("bottom-pin").click();
    await expect(bottom.getByTestId("bottom-pin")).toHaveAttribute("aria-pressed", "true");
    await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_ready']").click();
    await expect(bottom.getByTestId("annotation-collection")).toBeVisible();
    await expect(bottom.getByTestId("annotation-collection").getByRole("button", { name: "Delete", exact: true })).toBeEnabled();
    await expect(list.locator(`[data-annotation-list-id="${pinnedId}"]`)).toHaveAttribute("data-selected", "true");
    await expect(bottom.getByTestId("bottom-pin")).toHaveAttribute("aria-pressed", "true");
    expect(await page.getByTestId("revision-status").textContent()).toBe(beforePin.revision);
    expect(await page.getByTestId("history-status").textContent()).toBe(beforePin.history);
    expect(await page.getByTestId("dirty-status").textContent()).toBe(beforePin.dirty);

    await bottom.getByTestId("annotation-collection").getByRole("button", { name: "Delete", exact: true }).click();
    await expect(list.locator(`[data-annotation-list-id="${pinnedId}"]`)).toHaveCount(0);
    await expect(bottom.getByTestId("bottom-pin")).toHaveAttribute("aria-pressed", "false");
    await expect(host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_ready']")).toHaveCount(1);
    expect(errors).toEqual([]);
  });

  test(`Pin/Unpin is view-only and resumes Follow Selection at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await openCycle(page, viewport);
    const host = page.getByTestId("cycle-surface");
    const bottom = page.getByTestId("bottom-editor");
    await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
    const before = {
      revision: await page.getByTestId("revision-status").textContent(),
      history: await page.getByTestId("history-status").textContent(),
      dirty: await page.getByTestId("dirty-status").textContent(),
    };
    await bottom.getByTestId("bottom-pin").click();
    await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_ready']").click();
    await expect(bottom.getByTestId("bottom-pin")).toHaveAttribute("aria-pressed", "true");
    await expect(bottom).toContainText("REQUEST");
    await bottom.getByTestId("bottom-pin").click();
    await expect(bottom.getByTestId("bottom-pin")).toHaveAttribute("aria-pressed", "false");
    await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_clock']").click();
    await expect(bottom.locator(".bottom-tabs").getByRole("tab", { name: "Signal", exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(bottom).toContainText("CLOCK");
    expect(await page.getByTestId("revision-status").textContent()).toBe(before.revision);
    expect(await page.getByTestId("history-status").textContent()).toBe(before.history);
    expect(await page.getByTestId("dirty-status").textContent()).toBe(before.dirty);
  });

  test(`Pin/Unpin does not discard an Inspector Annotation draft at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await openCycle(page, viewport);
    const host = page.getByTestId("cycle-surface");
    const bottom = page.getByTestId("bottom-editor");
    await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
    await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();
    await page.getByTestId("annotation-toolbar").getByRole("button", { name: "Add annotation", exact: true }).click();
    const editor = page.getByTestId("annotation-editor");
    const label = editor.getByRole("textbox", { name: "Annotation label" });
    await label.fill("Unapplied note survives pin");
    const before = {
      revision: await page.getByTestId("revision-status").textContent(),
      history: await page.getByTestId("history-status").textContent(),
      dirty: await page.getByTestId("dirty-status").textContent(),
    };
    await bottom.getByTestId("bottom-pin").click();
    await bottom.getByTestId("bottom-pin").click();
    await expect(label).toHaveValue("Unapplied note survives pin");
    await expect(editor.getByTestId("apply-annotation-properties")).toBeEnabled();
    expect(await page.getByTestId("revision-status").textContent()).toBe(before.revision);
    expect(await page.getByTestId("history-status").textContent()).toBe(before.history);
    expect(await page.getByTestId("dirty-status").textContent()).toBe(before.dirty);
  });
}
