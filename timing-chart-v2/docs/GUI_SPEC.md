# GUI Specification

## 0. Normative priority
GUIの見た目は単なる参考ではない。`docs/GUI_VISUAL_CONTRACT.md` と executable reference を **Visual Acceptance Contract** とする。

優先順位:
1. Product behavior specification
2. Explicit v8 overrides in `references/v2-gui-reference-v8/gui-reference.json`
3. `docs/GUI_VISUAL_CONTRACT.md`
4. `docs/GUI_IMPLEMENTATION_REFERENCE.md`
5. v8 `index.html` / `styles.css` / `golden-home-cycle-1672x941.png`
6. Existing Replacement Pack and Production GUI

`TimingChart_GUI_Replacement_Pack` は「参考」ではなく、Productionへ移植する実装用DOM/CSS/Icon Reference。Productionはこれを基準にし、同じ機能を別レイアウトへ再設計してはならない。

## 1. Main layout
- Office/Ribbon風の上部UI。
- genericな1行button barへ置換しない。
- Left: Signal / Group tree
- Center upper: Waveform canvas
- Center lower: Context bottom editor
- Right: Inspector
- Legend / Annotation: Waveform上のoverlay

Bottom editorは原則 **Center column内だけ** に配置し、Left Signal Tree / Right Inspectorの下まで全幅に広げない。

Golden viewport 1672x941 / DPR 1では、Replacement Packのpane位置・Ribbon境界・Bottom Editor境界を基準とし、主要geometry差は0-2px以内を目標とする。

## 2. Ribbon
Ribbonは機能をグループ化して表示する。単純な横一列のボタン群は禁止。

想定タブ:
- File
- Home
- Insert
- Annotation
- View
- AI（後段）

Home/Insert等では関連commandをgroup化し、group separator / captionを持つ。

RibbonのiconographyはReplacement Pack由来の`gui-mockup/icons.svg`を基本とする。絵文字や無関係なgeneric iconへ勝手に置換しない。

## 3. View mode and Bottom tabs
Ribbon右側の同じ位置に`Cycle / Transaction / Split`のView Mode segmented controlを置く。

表示モードごとのBottom tabは次の通りとする。

- Cycle: Signal / Annotation / Problems / JSON
- Transaction: Transaction / Annotation / Problems / JSON
- Split: Signal / Transaction / Annotation / Problems / JSON

Cycle ViewではTransactionタブを表示しない。

JSONは低優先度で通常操作に必須としない。
Signal選択 -> Signal、Annotation選択 -> Annotation。ただしPin / Follow Selection OFFで固定可能。
Bottom panelは高さ変更・collapse可能。

## 4. Signal Editor
Event TableはStart/Value中心。End/Durationは計算表示でCanonical保存しない。
Binary quick buttons: 0 / 1 / X / Z。
Bus: Hex / Binary / Symbol / X / Z。
Clock専用Generator form。

## 5. Clock Edge Counter Inspector
Clock signal選択時、Right Inspectorに`Edge Numbers` sectionを表示する。

Controls:
- Show ON/OFF
- Count mode: Rising / Falling / Both
- Start number
- Count from: Signal start / Selected edge / Marker / Visible range start
- Show every N edges
- Position: Above / Below
- X offset px
- Y offset px

Count mode:
- Rising: rising edgeだけでカウントアップ
- Falling: falling edgeだけでカウントアップ
- Both: rising/fallingの両方で1つの連番をカウントアップ

複数Clockではsignalごとに設定・counterを独立させる。
Gated Clockは実際に存在する対象edgeだけをカウントする。

数字はWaveDromのClock SVGへ直接焼き込まず、WaveDrom Geometry Mapのactual edge座標へOverlayする。独自`cycle * pixelsPerCycle`推測は禁止。

Edge number表示の位置は`position + offset x/y`で調整し、必要に応じて1px単位のInspector入力を許可する。

## 6. Annotation Editor
Type、From/To Anchor、Label、Offsets、Snap、Style。
Canvas上Drag、矢印key 1px、Shift 10px、endpoint handles、label独立移動。

## 7. Group UI
+Group / +Signal。
Rename / Add / Insert Above-Below / Duplicate / Move / Collapse / Delete。
Drag & DropでGroup/Signal並べ替え。Group移動でSignal roleは変えない。

## 8. Vertical spacing / Group Band Inspector
- Global rowHeight / signalSpacing
- Group before / after
- Signal before / after
- Reset inherited/default
- Spacer追加 / 高さ / Drag
- Background ON/OFF, Color, Opacity
- Extend: label / waveform / both
- Border / Header
- 即時Preview + Undo/Redo

Signal rowのabsolute Yをcanonical保存しない。

## 9. Signal role/name columns
Role badgeとSignal nameは独立column。
- input -> `[i]`
- output -> `[o]`
- internal -> `[wire]`

Waveform lane内へ `i req_valid` / `wire busy` のようなrole+name文字列を重ねて表示しない。
Signal name columnはLeft/Center/Right、width調整、auto-fitを持つ。

## 10. Legend
Selectable Overlay。
Drag、keyboard nudge、X/Y、horizontal/vertical、show/hide、used roles only。

## 11. Waveform visual ownership
Waveform traceの形状はGUI CSSや独自SVG pathで決めない。
Cycle waveformは `docs/WAVEDROM_COMPATIBILITY.md` と `docs/WAVEDROM_CONFORMANCE.md` に従い、WaveDrom renderer/default skin geometryを使用する。
GUIはsignal/group background、selection、annotation、clock edge number等をその外側/overlayとして提供する。

## 12. AI-readable reference
Production用Referenceはsemantic HTML/CSS/SVGで表す。stable `data-testid` / `data-role` / `data-signal` / `data-anchor` を利用する。

Replacement Packの`production/index.html`、`production/styles.css`、`production/icons.svg`、`production/app-ui.js`を見てProduction UIを移植すること。Golden PNGを毎回AIが再解釈して別のHTMLを作る運用は禁止。

## 13. Visual regression requirement
GUI visual acceptanceは screenshot file existenceではない。

同一Chromium / viewport 1672x941 / DPR 1 / deterministic fixtureで、

Reference path:
Replacement Pack reference -> screenshot

DUT path:
Production app -> corresponding screenshot

を比較する。

必須:
- Layout metric test（主要geometry 0-2px）
- Reference vs DUT screenshot/perceptual diff（small reviewed threshold）
- failure時 reference / dut / diff artifact出力

WaveDrom trace内部はSVG conformanceで別途0px確認するためGUI screenshot差分ではmask可。ただしwaveform viewportの位置・サイズはmaskしない。

Clock Edge Counterについては、少なくともRising/Falling/Both、複数Clock、Gated Clock、labelEveryの代表状態をvisual/E2E fixtureで確認する。
