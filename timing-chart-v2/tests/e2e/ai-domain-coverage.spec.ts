import { expect, test, type Page } from "@playwright/test";

async function applyAI(page: Page, query: string, expectedSummary: string, expectedStatus = "Applied · one atomic SemanticCommand transaction") {
  const ai = page.getByTestId("ai-operation-panel");
  await ai.getByLabel("AI semantic query").fill(query);
  await ai.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(ai.getByTestId("ai-preview")).toContainText(expectedSummary);
  await ai.getByTestId("ai-validate").click();
  await expect(ai.getByTestId("ai-status")).toHaveText("Validated · deterministic local checks passed");
  await ai.getByTestId("ai-apply").click();
  await expect(ai.getByTestId("ai-status")).toHaveText(expectedStatus);
}

test("AI provider domains use one preview/apply SemanticCommand path", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  await page.getByLabel("Ribbon tabs").getByRole("button", { name: "AI", exact: true }).click();

  await applyAI(page, "create group named AI_GROUP", "Create group AI_GROUP");
  await applyAI(page, "create binary signal named AI_SIGNAL", "Create binary signal AI_SIGNAL");
  await expect(host.locator("[data-role='frozen-signal-name']").filter({ hasText: "AI_SIGNAL" })).toBeVisible();

  await applyAI(page, "insert 1 cycle at 2", "Insert 1 cycles at 2");
  await applyAI(page, "add bookmark at 4", "Add Bookmark 4");
  await applyAI(page, "create time group AI_WINDOW from 1 to 3", "Create Time Group AI_WINDOW");
  await applyAI(page, "create text annotation", "Create text annotation on REQUEST");
  await applyAI(page, "create transaction AI_TX from 2 to 4", "Create transaction AI_TX");

  await expect(host).toHaveAttribute("data-canonical-revision", "7");
  await expect(page.getByTestId("history-status")).toHaveText("History 7 / Redo 0");
  await expect(host.locator("[data-role='annotation-owner'][data-annotation-id]")).toHaveCount(1);
  await expect(page.locator(".editor-shell")).toHaveAttribute("data-transaction-count", "1");

  await page.getByLabel("Ribbon tabs").getByRole("button", { name: "Timeline", exact: true }).click();
  await expect(page.locator("[data-bookmark-id]").filter({ hasText: "Bookmark 4" })).toBeVisible();
  await expect(page.locator("[data-time-group-id]").filter({ hasText: "AI_WINDOW" })).toBeVisible();

  const beforeViewOnly = {
    revision: await host.getAttribute("data-canonical-revision"),
    history: await page.getByTestId("history-status").textContent(),
  };
  await page.getByLabel("Ribbon tabs").getByRole("button", { name: "AI", exact: true }).click();
  await applyAI(page, "fit all", "Fit the complete timeline", "Applied · view-only intent");
  await expect(host).toHaveAttribute("data-canonical-revision", beforeViewOnly.revision!);
  await expect(page.getByTestId("history-status")).toHaveText(beforeViewOnly.history!);
});
