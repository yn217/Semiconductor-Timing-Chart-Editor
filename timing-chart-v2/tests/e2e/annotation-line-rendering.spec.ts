import { expect, test } from "@playwright/test";

test("renders distinct connector paths and SVG arrowheads for every line type", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();
  await page.getByLabel("Annotation type").selectOption("arrow");
  await page.getByRole("button", { name: "Add annotation" }).click();

  const owner = host.locator("[data-role='annotation-owner'][data-annotation-type='arrow']").last();
  const editor = page.getByTestId("annotation-editor");
  const path = owner.locator("[data-role='annotation-path']");
  const observed = new Map<string, { readonly d: string; readonly dash: string | null }>();
  for (const lineType of ["straight", "diagonal", "curve", "orthogonal"] as const) {
    await editor.getByLabel("Annotation line type").selectOption(lineType);
    await editor.getByTestId("apply-annotation-properties").click();
    await expect(owner).toHaveAttribute("data-line-type", lineType);
    await expect(path).toHaveAttribute("data-line-type", lineType);
    observed.set(lineType, { d: await path.getAttribute("d") ?? "", dash: await path.getAttribute("stroke-dasharray") });
  }

  expect(observed.get("straight")?.d).toContain(" L ");
  expect(observed.get("straight")?.d).not.toContain(" Q ");
  expect(observed.get("diagonal")?.dash).toBe("7 4");
  expect(observed.get("curve")?.d).toContain(" Q ");
  expect((observed.get("orthogonal")?.d.match(/ L /g) ?? []).length).toBe(3);

  await editor.getByLabel("Annotation arrowhead").selectOption("bidirectional");
  await editor.getByTestId("apply-annotation-properties").click();
  await expect(path).toHaveAttribute("marker-start", /start/);
  await expect(path).toHaveAttribute("marker-end", /end/);
  await expect(owner.locator("marker")).toHaveCount(2);
  await expect(owner.locator("marker").first()).toHaveAttribute("orient", "auto-start-reverse");
  await expect(page.getByTestId("history-status")).toHaveText("History 5 / Redo 0");
});
