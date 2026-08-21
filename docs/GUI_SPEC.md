# GUI Specification

## Main layout
Top Ribbon/Toolbar / Left Signal-Group Tree / Center Waveform / Right Inspector / Bottom context editor / Overlay Legend+Annotation。

## Bottom tabs
Signal / Annotation / Problems / JSON。JSONは低優先度で通常表示しない。Signal選択->Signal、Annotation選択->Annotation。Pin/Follow Selection OFFで固定。

## Signal Editor
Event TableはStart/Value中心。End/Durationは計算表示でCanonical保存しない。Binary quick buttons 0/1/X/Z。BusはHex/Binary/Symbol/X/Z。Clock専用Generator form。

## Annotation Editor
Type、From/To Anchor、Label、Offsets、Snap、Style。Canvas上Drag、矢印key 1px、Shift 10px、endpoint handles、label独立移動。

## Group UI
+Group/+Signal。Rename/Add/Insert Above-Below/Duplicate/Move/Collapse/Delete。Drag & DropでGroup/Signal並べ替え。Group移動でSignal roleは変えない。

## Vertical spacing / Group Band Inspector
- Global rowHeight/signalSpacing
- Group before/after
- Signal before/after
- Reset inherited/default
- Spacer追加/高さ/Drag
- Background ON/OFF, Color, Opacity
- Extend: label/waveform/both
- Border/Header
即時Preview + Undo/Redo。

## Legend
Selectable Overlay。Drag、keyboard nudge、X/Y、horizontal/vertical、show/hide、used roles only。

## AI-readable mockup
UI構造はCanvasにせずsemantic HTML controls。stable data-testid/data-role/data-signal/data-anchor。Waveform visualだけSVG可。Tabsはbutton、controlはexplicit label。原画はreference assetとして保持する。
