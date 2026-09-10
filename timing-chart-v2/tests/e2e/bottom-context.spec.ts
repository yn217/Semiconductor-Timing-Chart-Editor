import { expect, test, type Page } from "@playwright/test";

async function ready(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
}

// #426 Bottom Panel UX Closure (source of truth: the Issue text, not this
// suite's own prior behavior): "Follow Selection OFF" must keep the current
// Bottom editor target, exactly like Pin, until Follow Selection is turned
// back on. This used to be a no-op for *which entity* Bottom shows (it only
// gated automatic Bottom-tab switching across entity kinds) -- unchecking
// Follow Selection here now freezes Bottom at REQUEST; further Tree
// selection changes move Inspector/selection-status but not Bottom.
test("Follow Selection OFF freezes the Bottom target; Pin locks in whatever is currently shown, independent of live selection", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  const bottom = page.getByTestId("bottom-editor");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  await expect(bottom).toContainText("REQUEST · Signal");
  await bottom.getByTestId("follow-selection").uncheck();
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_ready']").click();
  await expect(page.getByTestId("selection-status")).toHaveText("READY");
  // Follow Selection OFF: Bottom stays on REQUEST even though selection
  // (and Inspector) moved to READY.
  await expect(bottom).toContainText("REQUEST · Signal");
  await expect(bottom.getByTestId("bottom-pin")).toHaveAttribute("aria-pressed", "false");

  // Pin locks in whatever Bottom is CURRENTLY showing (REQUEST, the frozen
  // target) -- not the live selection (READY), which the user can no
  // longer see in the panel.
  await bottom.getByTestId("bottom-pin").click();
  await expect(bottom.getByTestId("bottom-pin")).toHaveText("Unpin");
  await expect(bottom).toContainText("REQUEST · Signal");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_valid']").click();
  await expect(page.getByTestId("selection-status")).toHaveText("VALID");
  await expect(bottom).toContainText("REQUEST · Signal");

  // Unpin with Follow Selection still off: stays frozen at REQUEST (does
  // not jump to the now-current VALID selection) -- Follow Selection OFF
  // still means "don't move".
  await bottom.getByTestId("bottom-pin").click();
  await expect(bottom.getByTestId("bottom-pin")).toHaveText("Pin");
  await expect(bottom).toContainText("REQUEST · Signal");

  // Turning Follow Selection back on resumes live tracking.
  await bottom.getByTestId("follow-selection").check();
  await expect(bottom).toContainText("VALID · Signal");
});

test("Bottom Pin preserves a selected Group JSON context without view mutation", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  const bottom = page.getByTestId("bottom-editor");
  const surface = host.locator("[data-role='timing-chart-surface']");
  const before = {
    revision: await host.getAttribute("data-canonical-revision"),
    history: await page.getByTestId("history-status").textContent(),
    dirty: await page.getByTestId("dirty-status").textContent(),
    counters: await surface.getAttribute("data-render-counters"),
  };

  await host.locator("[data-role='left-group-header'][data-group-id='grp_cycle_control'] [data-role='tree-branch'][data-group-id='grp_cycle_control']").first().click();
  await bottom.getByRole("tab", { name: "JSON", exact: true }).click();
  const json = page.getByTestId("json-panel");
  await json.getByTestId("json-advanced-toggle").click();
  await json.getByLabel("JSON scope").selectOption("selected");
  const editor = json.getByLabel("Advanced JSON");
  await expect(editor).toHaveValue(/"name": "Control"/);

  await bottom.getByTestId("bottom-pin").click();
  await expect(bottom.getByTestId("bottom-pin")).toHaveAttribute("aria-pressed", "true");
  await host.locator("[data-role='left-group-header'][data-group-id='grp_cycle_payload'] [data-role='tree-branch'][data-group-id='grp_cycle_payload']").first().click();
  await expect(page.getByTestId("selection-status")).toHaveText("Payload");
  await expect(editor).toHaveValue(/"name": "Control"/);

  await expect(host).toHaveAttribute("data-canonical-revision", before.revision!);
  await expect(page.getByTestId("history-status")).toHaveText(before.history!);
  await expect(page.getByTestId("dirty-status")).toHaveText(before.dirty!);
  await expect(surface).toHaveAttribute("data-render-counters", before.counters!);

  await bottom.getByTestId("bottom-pin").click();
  await expect(bottom.getByTestId("bottom-pin")).toHaveAttribute("aria-pressed", "false");
  await expect(editor).toHaveValue(/"name": "Payload"/);
});

test("Advanced JSON applies a selected object through one document command", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  const bottom = page.getByTestId("bottom-editor");
  await bottom.getByRole("tab", { name: "JSON", exact: true }).click();
  const json = page.getByTestId("json-panel");
  await json.getByTestId("json-advanced-toggle").click();
  await json.getByLabel("JSON scope").selectOption("selected");
  const editor = json.getByLabel("Advanced JSON");
  const selected = JSON.parse(await editor.inputValue()) as Record<string, unknown>;
  selected.name = "REQUEST_JSON";
  (selected.display as Record<string, unknown>).name = "REQUEST_JSON";
  await editor.fill(JSON.stringify(selected, null, 2));
  await json.getByTestId("apply-advanced-json").click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await expect(host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request'] [data-role='frozen-signal-name']")).toHaveText("REQUEST_JSON");
  await expect(json).toContainText("REQUEST_JSON");
});

test("Whole Document JSON stays read-only until Advanced mode and validates before Apply", async ({ page }) => {
  await ready(page);
  const bottom = page.getByTestId("bottom-editor");
  await bottom.getByRole("tab", { name: "JSON", exact: true }).click();
  const json = page.getByTestId("json-panel");
  await expect(json.locator("pre")).toBeVisible();
  await expect(json.getByLabel("Advanced JSON")).toHaveCount(0);
  await json.getByTestId("json-advanced-toggle").click();
  await json.getByLabel("JSON scope").selectOption("document");
  await json.getByRole("button", { name: "Validate", exact: true }).click();
  await expect(json).toContainText("Valid");
});

test("Advanced JSON applies a selected Group through one document command", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  await host.locator("[data-role='left-group-header'][data-group-id='grp_cycle_control'] [data-role='tree-branch'][data-group-id='grp_cycle_control']").first().click();
  const bottom = page.getByTestId("bottom-editor");
  await bottom.getByRole("tab", { name: "JSON", exact: true }).click();
  const json = page.getByTestId("json-panel");
  await json.getByTestId("json-advanced-toggle").click();
  await json.getByLabel("JSON scope").selectOption("selected");
  const editor = json.getByLabel("Advanced JSON");
  const selected = JSON.parse(await editor.inputValue()) as Record<string, unknown>;
  selected.name = "CONTROL_JSON";
  await editor.fill(JSON.stringify(selected, null, 2));
  await json.getByTestId("apply-advanced-json").click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await expect(host.locator("[data-role='left-group-header'][data-group-id='grp_cycle_control']")).toContainText("CONTROL_JSON");
  const downloadPromise = page.waitForEvent("download");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
  const savedPath = await (await downloadPromise).path();
  expect(savedPath).toBeTruthy();
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(savedPath!);
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(host.locator("[data-role='left-group-header'][data-group-id='grp_cycle_control']")).toContainText("CONTROL_JSON");
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
});
