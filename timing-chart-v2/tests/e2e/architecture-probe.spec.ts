import { expect, test } from "@playwright/test";

test("extracts Phase 4 Local Geometry from rendered WaveDrom SVG in Chromium", async ({ page }) => {
  await page.goto("/?probe=geometry");
  await expect(page.getByRole("heading", { name: "Timing Chart Editor V2" })).toBeVisible();
  await expect(page.getByText("Phase 4 Local Geometry probe — WaveDrom 3.6.2")).toBeVisible();
  const mount = page.getByTestId("wave-mount");
  await expect(mount).toHaveAttribute("data-wave-owner", "sig_phase3_probe");
  const svg = mount.locator("svg.WaveDrom[data-wave-owner='sig_phase3_probe']");
  await expect(svg).toHaveCount(1);
  await expect(svg).toHaveAttribute("data-wave-render-index", "0");
  await expect(mount.locator("svg.WaveDrom path")).not.toHaveCount(0);
  await expect(mount).toHaveAttribute("data-geometry-builds", "1");
  await expect(mount).toHaveAttribute("data-geometry-matrix-reads", "2");
  const geometry = JSON.parse(await mount.getAttribute("data-local-geometry") ?? "null") as Record<string, { x: number; y: number }>;
  expect(geometry).toEqual({
    cycleStart: { x: 100.5, y: 15.5 },
    cycleCenter: { x: 120.5, y: 15.5 },
    transitionStart: { x: 103.5, y: 15.5 },
    transitionCenter: { x: 106.5, y: 15.5 },
    transitionEnd: { x: 109.5, y: 15.5 },
    valueStart: { x: 109.5, y: 15.5 },
    rising: { x: 106.5, y: 15.5 },
    falling: { x: 226.5, y: 15.5 },
  });

  const clock = page.getByTestId("clock-mount");
  await expect(clock).toHaveAttribute("data-wave-owner", "sig_phase4_clock");
  const clockGeometry = JSON.parse(await clock.getAttribute("data-local-geometry") ?? "null") as Record<string, { x: number; y: number }>;
  expect(clockGeometry).toEqual({
    rising: { x: 80.5, y: 15.5 },
    falling: { x: 40.5, y: 15.5 },
    cycleStart: { x: 100.5, y: 15.5 },
  });

  const bus = page.getByTestId("bus-mount");
  await expect(bus).toHaveAttribute("data-wave-owner", "sig_phase4_bus");
  const busGeometry = JSON.parse(await bus.getAttribute("data-local-geometry") ?? "null") as Record<string, { x: number; y: number }>;
  expect(busGeometry).toEqual({
    transitionStart: { x: 143.5, y: 15.5 },
    transitionEnd: { x: 149.5, y: 15.5 },
    valueStart: { x: 149.5, y: 15.5 },
  });
});
