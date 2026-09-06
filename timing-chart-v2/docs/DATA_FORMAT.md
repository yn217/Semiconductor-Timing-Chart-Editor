# Data Format Specification

## File policy
1 diagram = 1 `.tcd` file。中身はUTF-8 JSON。`formatVersion`必須。WaveDrom用一時WaveJSONは保存しない。

## Top level (current v2)
```json
{"formatVersion":2,"document":{},"timeline":{"labelAnchors":[]},"signalGroups":[],"signals":[],"bookmarks":[],"timeGroups":[],"annotations":[],"legend":{},"layout":{},"transactions":[],"constraints":[],"checkSettings":{}}
```

`formatVersion: 1` remains readable. On Open it is deterministically normalized to v2 through the `MIGRATION_REGISTRY`; each registered step declares whether it is lossless or lossy and a lossy step must emit a structured warning (or reject explicitly). The first successful Save writes v2. Unknown future versions produce a blocking compatibility preview without replacing the current document. An explicit Compatibility Mode open is read-only/protected until a compatible target is established; newer fields are never silently dropped. WaveJSON, SVG geometry, DOM/view state, scroll/zoom/selection, Problems results, and generated edge lists are never persisted.

Migration tests use immutable regression inputs and separately cover chained registry order, V1-to-V2 compatibility, structured lossy warnings, and current-version Save/Open round trips. A future format step must be added to the registry with an explicit loss policy and fixture before it can be selected; scattered `formatVersion` switches and silent field dropping are not supported.

### v2 persisted additions

- `bookmarks[]`: stable `id`, non-empty `name`, source-time `start`, optional `comment`.
- `timeGroups[]`: source-time `[start,end)` interval and optional `presentation` (`collapsed`, `foldStyle`, `foldLabel`, `resumeLabelAnchorId`). Derived duration and pixel geometry are excluded.
- `timeline.labelAnchors[]`: stable `id`, source-time `source`, authored ruler `display`, optional `ownerTimeGroupId`.
- `checkSettings`: validator configuration only; Problems results and filters are derived.

All v2 additions are owned by the canonical serializer/validator. IDs and cross references are checked before Save/Open, non-finite numbers are rejected, and arrays retain semantic order.

## Signal change-point model
```json
{"id":"req_valid","name":"req_valid","type":"binary","role":"input","values":[{"start":0,"value":0},{"start":4,"value":1},{"start":7,"value":0}]}
```
Rules: `start`昇順、同一start重複は原則invalid、値は次changeまで継続、普通のsignal stateにendを保存しない、canonical fieldは`start`で`at`は禁止。

### Bus literal policy

Bus values are parsed by one shared semantic literal parser used by the live editor, canonical Problems validation, and imported Signal configurations. Hexadecimal values may omit or include `0x`; binary values may omit or include `0b` when the display format is binary. Numeric width is determined from the exact value (`BigInt` bit length), so leading zeroes do not create false overflow and non-nibble widths are handled exactly. X/Z digits are accepted as unknown values and consume their positional width. Identifier-like symbolic values such as `IDLE` are accepted for symbolic buses; mixed invalid text is rejected. A value is rejected before mutation when its required width exceeds the Signal's declared `width`.

## Clock
Generatorとして保存し、全edgeを列挙しない。period/duty/phase/polarityとenable change-pointsを持つ。

Clock signalは表示用の`edgeCounter`設定を任意で持てる。Edge番号自体はDerived Dataであり永続化しない。

```json
{
  "id": "aclk",
  "name": "ACLK",
  "type": "clock",
  "role": "input",
  "generator": {
    "start": 0,
    "period": 1,
    "duty": 0.5,
    "phase": 0,
    "initial": 0
  },
  "edgeCounter": {
    "show": true,
    "mode": "rising",
    "startNumber": 1,
    "countFrom": "signal-start",
    "labelEvery": 1,
    "position": "above",
    "offset": {"x": 0, "y": -6}
  }
}
```

`edgeCounter.mode`:
- `rising`
- `falling`
- `both`

`countFrom`:
- `signal-start`
- `selected-edge`（別途semantic anchorを保持）
- `marker`（marker idを参照）
- `visible-range-start`

`labelEvery`は1以上の整数。Counterは対象edgeごとに進み、表示ラベルだけN edgeごとに間引く。

複数Clockのcounterはsignalごとに独立。Gated Clockは実際に描画される対象edgeだけを数え、停止区間では進まない。

## Group
Array orderが表示順。RoleはGroup membershipを制約しない。Group styleにbackground/opacity/extend/border/header、spacingBefore/Afterを保持可能。

## Layout
`roleColumnWidth`, `signalNameWidth`, `signalNameAlign`, `rowHeight`, `signalSpacing`, overflow。Signalごとのspacing overrideとSpacerを許可。

## Annotation anchor
Anchorはsignal + semantic time + point。Visual微調整はoffset x/y pxで別保存。Rangeはstart/end anchorを別々に持つ。

## Dependency edge
from/to anchor、line type、arrowhead、label、start/end/label offset。

## Legend
Anchor+OffsetまたはCanvas free position。orientation、usedRolesOnly。
# TimeGroup hierarchy compatibility (#412)

## TimeGroup editing commands (#413)

`timeGroup.groupRange` takes a fresh `timeGroupId`, integer `start/end`, and
optional `name/category`. `resolveTimeGroupRange(document, range)` is the shared
capability/preflight: missing or zero-width selection, out-of-timeline ranges,
equal ranges and partial overlaps return specific diagnostics. Adjacency is
legal. The smallest enclosing range is the parent; ties use greatest explicit
depth, then stable ID. Enclosed groups whose parents are not also enclosed are
reparented to the new group; deeper links stay intact. Canonical array order is
preserved, with the new group appended. Old flat data is not globally reparented.

`timeGroup.ungroup` removes one group and promotes its direct children to its
parent (or roots). Existing `timeGroup.delete` uses the same promotion policy.
Resume label anchors are detached through the existing deletion policy. Group
and Ungroup each commit once through CommandHistorySession and restore the full
document, links and order on Undo/Redo. Existing property edits retain parentId;
invalid containment is rejected by canonical validation. Timeline insert/delete
reuse existing half-open transforms and final canonical validation. Duplicating
a complete subtree remaps copied parent IDs; a copy whose external parent no
longer contains it is rejected atomically. UI/Outline integration follows #414;
nested fold projection follows #415.

TimeGroup `parentId` optionally references a TimeGroup stable ID in the same
document. Omission means root; existing flat documents retain all roots even
when their ranges contain one another. Version 2 remains the format version:
this is an optional additive field. Older strict V2 readers may reject the new
field rather than silently drop it. V1 migration preserves an explicit parentId
for validation; it never infers parents from ranges.

Children must satisfy `start >= parent.start && end <= parent.end`. Shared
boundaries and equal ranges are valid at the canonical model boundary. Missing
parents, duplicate IDs and direct/indirect cycles are invalid. Group creation's
overlap and equal-range policy belongs to the semantic command layer (#413).

`buildTimeGroupHierarchy` in schema is the shared derived hierarchy owner.
It returns roots, childrenByParent, depthById and maxDepth (root depth 0, empty
maxDepth 0), ordered by start ascending, end descending, then opaque stable ID.
Graph validation and depth traversal are iterative O(n); ordering is O(n log n).
Invalid graphs throw structured problems rather than being silently repaired.
Depth is never persisted. This addition does not change fold mapping or GUI.
