# Data Format Specification

## File policy
1 diagram = 1 `.tcd` file。中身はUTF-8 JSON。`formatVersion`必須。WaveDrom用一時WaveJSONは保存しない。

## Top level
```json
{"formatVersion":1,"document":{},"timeline":{},"signalGroups":[],"signals":[],"annotations":[],"legend":{},"layout":{},"transactions":[],"constraints":[]}
```

## Signal change-point model
```json
{"id":"req_valid","name":"req_valid","type":"binary","role":"input","values":[{"start":0,"value":0},{"start":4,"value":1},{"start":7,"value":0}]}
```
Rules: `start`昇順、同一start重複は原則invalid、値は次changeまで継続、普通のsignal stateにendを保存しない、canonical fieldは`start`で`at`は禁止。

## Clock
Generatorとして保存し、全edgeを列挙しない。period/duty/phase/polarityとenable change-pointsを持つ。

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
