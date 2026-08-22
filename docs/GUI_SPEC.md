# GUI Specification

## 0. Normative priority
GUIの見た目は単なる参考ではない。`docs/GUI_VISUAL_CONTRACT.md` と Golden GUI images を **Visual Acceptance Contract** とする。

優先順位:
1. `docs/GUI_VISUAL_CONTRACT.md`
2. Golden GUI images (`gui-mockup/assets/original/`)
3. `docs/GUI_SPEC.md`
4. `gui-mockup/index.html` / CSS / JS（AI-readable structural reference）

HTML mockupだけを見て一般的なWeb UIへ簡略化してはならない。Golden imageと構造が矛盾する場合はGolden image/Visual Contractを優先する。

## 1. Main layout
- Office/Ribbon風の上部UI。
- genericな1行button barへ置換しない。
- Left: Signal / Group tree
- Center upper: Waveform canvas
- Center lower: Context bottom editor
- Right: Inspector
- Legend / Annotation: Waveform上のoverlay

Bottom editorは原則 **Center column内だけ** に配置し、Left Signal Tree / Right Inspectorの下まで全幅に広げない。

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

## 3. Bottom tabs
Signal / Annotation / Problems / JSON。Transaction実装後はTransactionを追加可能。

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
Cycle waveformは `docs/WAVEDROM_COMPATIBILITY.md` に従い、WaveDrom renderer/default skin geometryを使用する。
GUIはsignal/group background、selection、annotation、clock edge number等をその外側/overlayとして提供する。

## 12. AI-readable mockup
UI構造はsemantic HTML controlsで表す。stable `data-testid` / `data-role` / `data-signal` / `data-anchor` を利用する。Waveform visualだけSVG可。

ただし `gui-mockup/index.html` は **構造をAIへ伝える補助資料** であり、Golden imageを無視して見た目を簡略化する根拠にはならない。

## 13. Visual regression requirement
Signal / Annotation / JSON（将来Transaction）の代表画面をPlaywright screenshotで保存し、Golden画像との差分をCIで検出する。
Layout metric testとvisual screenshot testの両方を持つこと。

Clock Edge Counterについては、少なくともRising/Falling/Both、複数Clock、Gated Clock、labelEveryの代表状態をvisual/E2E fixtureで確認する。
