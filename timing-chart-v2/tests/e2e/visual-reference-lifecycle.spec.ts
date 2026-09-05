import { expect, test } from "@playwright/test";

test("mounts production routes repeatedly without runtime lifecycle errors", async ({ browser }) => {
  const context = await browser.newContext();
  const errors: string[] = [];
  try {
    for (const route of ["/?visual-reference", "/", "/?visual-reference", "/"]) {
      const page = await context.newPage();
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(`${route} console: ${message.text()}`);
      });
      page.on("pageerror", (error) => errors.push(`${route} pageerror: ${error.message}`));
      await page.goto(route);
      await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
      await page.close();
    }
  } finally {
    await context.close();
  }
  expect(errors).toEqual([]);
});
