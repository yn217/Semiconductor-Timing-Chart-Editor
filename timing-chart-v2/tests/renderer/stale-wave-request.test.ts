import { describe, expect, it } from "vitest";
import { isWaveMountRequestFresh } from "../../packages/renderer/src/stable-surface.js";

describe("wave mount freshness", () => {
  it("rejects an older same-epoch Signal render after a newer version is queued", () => {
    let currentVersion = 1;
    const oldRequest = { documentEpoch: 7, isFresh: () => currentVersion === 1 };
    currentVersion = 2;
    expect(isWaveMountRequestFresh(oldRequest, 7)).toBe(false);
    expect(isWaveMountRequestFresh({ documentEpoch: 7, isFresh: () => currentVersion === 2 }, 7)).toBe(true);
  });

  it("does not reject an unrelated Signal render when the document revision advances", () => {
    const signalA = { documentEpoch: 7, isFresh: () => true };
    expect(isWaveMountRequestFresh(signalA, 7)).toBe(true);
  });
});
