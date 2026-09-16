# Product Specification

## 1. Scope
半導体チップ仕様書に掲載するタイミングチャート専用アプリ。既存CADとは別ソフト。

表示モード:
- Cycle View
- Transaction View
- Combined View (Cycle View + Transaction View on one shared time axis)

Signal Split is a Cycle View layout option with two vertically independent
viewports. It is not a fourth view mode and does not mean Combined View.

初期実装はCycle View優先。

## 2. Core design principles
1. WaveDromの波形描画品質を踏襲する。
2. `0...1..0...` のような文字位置記法をユーザーに書かせない。
3. 波形は変化点だけを `start` / `value` で保存し、次の変更点まで継続する。
4. Cycle挿入/削除をExcel列操作のように時間軸へ行う。
5. AnnotationはWaveform上のOverlay。Semantic Anchor + pixel Offset。
6. JSONは通常UIでは隠し、下ペインのJSONタブから明示的に見る。
7. 1図=1 JSON系ファイルを基本とする。

## 3. Signal types
- binary: 0/1/X/Z
- bus: numeric/hex/symbolic/X/Z
- state
- clock: period/duty/phase/polarity/enable
- event/pulse
- WaveDrom互換のweak high/low等も表現対象

Canonical example:
```json
{"id":"valid","name":"valid","type":"binary","role":"input","values":[{"start":0,"value":0},{"start":4,"value":1},{"start":7,"value":0}]}
```
`end`は普通の信号値には保存しない。

## 4. Signal role
- input -> `[i]`
- output -> `[o]`
- internal -> `[wire]`
RoleはSemantic属性、Groupは図の見せ方。両者は独立。

## 5. Signal Groups
固定Input/Output/Internal 3グループは禁止。任意個作成可能。同じRoleのGroupを複数作成可能。`Input -> Internal -> Input` の順序も許可。Group内Role混在可。Group/SignalはDrag & Drop。

## 6. Signal label layout
Role列 / Signal Name列 / Waveform列を分離。
Signal名はLeft/Center/Right、列幅px、Drag resize、Auto Fit、Expand/Ellipsis/Wrap。

## 7. Legend
使用Roleのみ凡例表示可能。Overlay Objectとして自由移動。Drag、矢印1px、Shift+矢印10px、Inspector X/Y、Undo/Redo。Anchor+OffsetまたはFree Position。

## 8. Signal vertical layout / Group Band
SignalのYは絶対座標保存しない。
- global rowHeight
- global signalSpacing
- Group spacingBefore/spacingAfter
- Signal spacingBefore/spacingAfter
- arbitrary-height Spacer
を合成する。全体一括/Group/Signal個別をGUIで調整。

Groupは薄い背景Bandを持てる。AXI Address/Data/Response、Clock/Reset、CDC Domain等の区別に利用。
- background color / opacity
- signal-name only / waveform only / both
- optional border / group header
- GUI編集
- SVG/PNG/PDFに反映
- presetは可、色固定は禁止

## 9. Annotation Overlay
Text/Callout、Vertical Line、Range、Bracket、Highlight、Marker、Measurement、ArrowをWaveform上へOverlay。Drag、endpoint handles、label独立移動、1px nudge。

## 10. Exact waveform snapping
Clock edge等との数pxずれを許容しない。独自`cycle -> pixel`推測は禁止。WaveDromが確定した実GeometryからAnchor座標を取得。
Anchor: cycle-start/center/end, transition-start/center/end, rising-edge, falling-edge, value-start。
Snap: clock edge, signal transition, bus transition, cycle boundary, marker, other annotation。Snap後もpx offset可能。

## 11. Transition arrows
WaveDrom node/edge相当をGUI化。From transition click -> To transition click。
Line: straight/orthogonal/curve/diagonal。Arrow: end/start/bidirectional/none。Label、start/end/label offsetを個別調整。

## 12. Timeline editing
Insert Before/After、Insert N Cycles、Delete Cycle/Range、Duplicate/Move Range、Collapse/Gap、Marker。Ripple editでSignal changes/Annotation/Transactionを追従。Undo/Redo 1操作単位。

## 13. Bottom Editor
Tabs: Signal / Annotation / Problems / JSON（後にTransaction）。通常はSelection follow。Pin/Follow Selection OFFあり。Right Inspectorは軽量Property、Bottomはデータ編集。

## 14. JSON UI
JSONは自動生成。通常非表示。JSON tabはDefault Read Only。Advanced editable、Format、Validate、Copy、Selected/Whole、Live Sync、error location。

## 15. Open file boundary
Production Open checks the selected `.json`/`.tcd` file size before reading or parsing it. The initial product limit is 32 MiB (33,554,432 bytes). Oversized input is rejected without changing the current Canonical document, History, Dirty state, selection, or rendered document, and the Problems surface reports the measured and allowed byte counts with recovery guidance.

## 16. Header / Footer / Export
長文はWaveform幅とは独立したDocument Layoutでwrap。Title/Subtitle/Description/Notes/Preconditions/Legend/Figure number/Revision。SVG/PNG/PDF/Clipboard SVG/PNG、Fit Width/Page/Selection。

## 16. Transaction View
同一時間軸上でTransaction、Phase、Burst、Overlap、Pipelineを表現。Transaction <-> Cycle View相互Highlight。Cycle/Transaction/Split切替。

## 17. Clock Edge Counter / Edge Index
Clock signalごとに独立したEdge番号表示を持つ。

Count mode:
- rising: rising edgeだけでカウントアップ
- falling: falling edgeだけでカウントアップ
- both: rising/fallingの両方で1つの連番をカウントアップ

表示番号はWaveDromが描画した実Edge GeometryへOverlayし、独自`cycle * pixelsPerCycle`座標で配置しない。

Signalごとの設定:
- show ON/OFF
- mode: rising / falling / both
- startNumber: 0/1/任意整数
- countFrom: signal-start / selected-edge / marker / visible-range-start
- labelEvery: 毎edge / N edgeごと（内部カウントは全edgeで継続し、表示だけ間引く）
- position: above / below
- offset x/y px

複数Clockでは各signalが独立したcounterを持つ。ACLK/PCLK/DDRCLK等が同時に表示されても相互にcounterを共有しない。

Gated Clockでは、実際にWaveDrom上に存在する対象edgeだけを数える。Clock停止区間ではcounterを進めない。

Edge番号はDerived Dataであり、各edgeの番号列を保存ファイルへ列挙しない。保存するのはcounter設定だけ。

将来、Annotation/Rangeのanchorとして `clock edge index` を利用可能な構造にする。

## 18. Golden Samples
01 APB、02 AHB-Lite、03 AXI4 Full Write、04 AXI4 Full Read outstanding、05 SRAM1P、06 SRAM2P、07 AXI→DRAM、08 Async FIFO、09 Accelerator、10 AXI4-Stream。
11 Signal types/roles/legend、12 Group bands/spacing、13 Signal labels、14 Annotation、15 Arrows、16 Clock/gap/edge counter、17 Ripple edit、18 Legend/group order、19 Header/footer/export、20 Transaction/Cycle linked。
