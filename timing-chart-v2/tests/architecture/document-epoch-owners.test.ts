import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

type EpochOwner = { readonly owner: string; readonly file: string; readonly markers: readonly RegExp[] };

const workspace = resolve(import.meta.dirname, "../..");
const owners: readonly EpochOwner[] = [
  {
    owner: "document replacement lifecycle",
    file: "apps/editor/src/application/use-document-lifecycle.ts",
    markers: [/documentEpoch\.advance\(\)/, /applyReplacement/],
  },
  {
    owner: "timeline presentation collapse state",
    file: "apps/editor/src/workspace/use-timeline-presentation-state.ts",
    markers: [/input\.documentEpoch/, /setCollapsedGroupIds\(empty\)/],
  },
  {
    owner: "entity editor and inspector drafts",
    file: "apps/editor/src/editor-secondary-surfaces.tsx",
    markers: [/input\.documentEpoch/, /key=\{`\$\{input\.documentEpoch\}/],
  },
  {
    owner: "transaction group and drag state",
    file: "apps/editor/src/runtime/transaction-lanes.tsx",
    markers: [/documentEpoch/, /drag.documentEpoch/],
  },
  {
    // #759: Group disclosure moved out of TransactionLanes/TransactionTree into one workspace-level owner.
    owner: "transaction group disclosure",
    file: "apps/editor/src/workspace/use-transaction-disclosure.ts",
    markers: [/documentEpoch/, /setCollapsed\(new Set\(\)\)/],
  },
  {
    // #763: unapplied Phase drafts are document-relative; a DocumentEpoch change drops them all.
    owner: "retained transaction phase drafts",
    file: "apps/editor/src/editor-secondary-surfaces.tsx",
    markers: [/clearAllPhaseDrafts\(\)/, /\[input\.documentEpoch\]/],
  },
  {
    owner: "bookmark selection state",
    file: "apps/editor/src/application/use-editor-actions.ts",
    markers: [/input\.documentEpoch/, /selectedBookmarkId/],
  },
  {
    // #772: unapplied Bookmark drafts are document-relative; a DocumentEpoch change drops them all (same owner as #763's Phase drafts).
    owner: "retained bookmark drafts",
    file: "apps/editor/src/editor-secondary-surfaces.tsx",
    markers: [/clearAllBookmarkDrafts\(\)/, /\[input\.documentEpoch\]/],
  },
  {
    owner: "document-relative UI reset",
    file: "apps/editor/src/minimal-cycle-view.tsx",
    markers: [/runtime\.documentEpoch\.current\(\)/, /setContextMenu\(undefined\)/, /setPinnedBottomSelection\(undefined\)/],
  },
];

describe("document-relative transient state ownership", () => {
  it("keeps every inventoried owner connected to the shared DocumentEpoch contract", () => {
    for (const entry of owners) {
      const source = readFileSync(resolve(workspace, entry.file), "utf8");
      for (const marker of entry.markers) expect(source, `${entry.owner}: ${entry.file}`).toMatch(marker);
    }
    expect(owners.map((entry) => entry.owner)).toEqual(expect.arrayContaining([
      "document replacement lifecycle",
      "timeline presentation collapse state",
      "entity editor and inspector drafts",
      "transaction group and drag state",
      "transaction group disclosure",
      "retained transaction phase drafts",
      "bookmark selection state",
      "retained bookmark drafts",
      "document-relative UI reset",
    ]));
  });
  // #743: the failure boundary is commitDocumentReplacement (behaviour tested in tests/editor/document-replacement.test.ts); here we pin that the
  // lifecycle hook goes through it and advances the epoch nowhere else, and that inside it the epoch advance follows the session replacement.
  it("routes every replacement through commitDocumentReplacement (epoch advance strictly after session replacement, once)", () => {
    const lifecycle = readFileSync(resolve(workspace, "apps/editor/src/application/use-document-lifecycle.ts"), "utf8");
    const boundary = readFileSync(resolve(workspace, "apps/editor/src/application/document-replacement.ts"), "utf8");
    expect(lifecycle).toContain("commitDocumentReplacement(");
    expect(lifecycle.split("documentEpoch.advance()")).toHaveLength(2);
    expect(lifecycle.indexOf("commitDocumentReplacement(")).toBeLessThan(lifecycle.indexOf("applyReplacement({"));
    const replace = boundary.indexOf("port.replaceSession(");
    const advance = boundary.indexOf("port.advanceEpoch()");
    expect(replace).toBeGreaterThan(-1);
    expect(advance).toBeGreaterThan(replace);
    expect(boundary.split("port.advanceEpoch()")).toHaveLength(2);
  });
});
