import { expect, type Locator } from "@playwright/test";

export type BoundaryEdge = "left" | "right";

/**
 * Assert that independently rendered surfaces place the same semantic source
 * boundary at the same screen X. The ruler is the visual reference, while the
 * caller supplies the matching boundary element for each consumer.
 */
export async function expectSharedSourceBoundaryX(
  cycle: number,
  rulerBoundary: Locator,
  consumers: readonly Readonly<{ name: string; locator: Locator; edge?: BoundaryEdge }>[],
  tolerancePx = 0.5,
): Promise<Readonly<Record<string, number>>> {
  const rulerBox = await rulerBoundary.boundingBox();
  expect(rulerBox, `ruler boundary for source cycle ${cycle} must be rendered`).not.toBeNull();
  const referenceX = rulerBox!.x;
  const positions: Record<string, number> = { ruler: referenceX };

  for (const consumer of consumers) {
    const box = await consumer.locator.boundingBox();
    expect(box, `${consumer.name} boundary for source cycle ${cycle} must be rendered`).not.toBeNull();
    const x = consumer.edge === "right" ? box!.x + box!.width : box!.x;
    positions[consumer.name] = x;
    expect(
      Math.abs(referenceX - x),
      `source cycle ${cycle}: ruler X ${referenceX} vs ${consumer.name} X ${x}`,
    ).toBeLessThanOrEqual(tolerancePx);
  }

  return positions;
}
