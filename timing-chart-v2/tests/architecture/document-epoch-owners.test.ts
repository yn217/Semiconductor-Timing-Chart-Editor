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
      "document-relative UI reset",
    ]));
  });
  // #743: the epoch advances only after the authoritative session replacement succeeds (a throwing replaceSession must leave the epoch untouched).
  it("advances the document epoch strictly after session replacement", () => {
    const source = readFileSync(resolve(workspace, "apps/editor/src/application/use-document-lifecycle.ts"), "utf8");
    const replace = source.indexOf("application.replaceSession(");
    const advance = source.indexOf("documentEpoch.advance()");
    const effects = source.indexOf("applyReplacement({");
    expect(replace).toBeGreaterThan(-1);
    expect(advance).toBeGreaterThan(replace);
    expect(effects).toBeGreaterThan(advance);
    expect(source.match(/documentEpoch.advance()/g)).toHaveLength(1);
  });
});
