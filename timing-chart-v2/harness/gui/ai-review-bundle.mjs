/** Build a stable, serialisable bundle manifest for human/AI visual review. */
export function createAiReviewBundle({ gitHead, scenario, viewport, dpr = 1, actions = [], images = {}, crops = [], diagnostics = { findings: [] }, expectedChange = [], stableRegions = [] }) {
  if (!gitHead || !scenario || !Array.isArray(viewport) || viewport.length !== 2) throw new Error("gitHead, scenario, and viewport [width,height] are required");
  return {
    schemaVersion: 1,
    testedCommit: gitHead,
    scenario,
    capture: { viewport: [...viewport], dpr },
    actions: [...actions],
    images: { before: images.before ?? null, current: images.current ?? null, reference: images.reference ?? null },
    crops: [...crops],
    diagnostics,
    expectedChange: [...expectedChange],
    stableRegions: [...stableRegions],
    reviewInstructions: [
      "Check visual crowding and hierarchy consistency beyond numeric findings.",
      "Check for ghost, doubled, blurred, or uneven text and icons.",
      "Check excessive whitespace and waveform/annotation readability.",
      "Check for changes outside the intended interaction scope.",
    ],
  };
}
