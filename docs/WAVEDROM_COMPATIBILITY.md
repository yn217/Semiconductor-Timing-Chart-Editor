# WaveDrom Compatibility / Difference Specification

## Principle
WaveDromの優れた信号波形形状を再発明しない。Cycle waveform rendererはWaveDrom Renderer/Skinを利用するか、将来自前化する場合もWaveDrom SVG geometryをGolden Referenceにする。

## Preserve / implement
- 0/1/X/Z
- weak high/low等
- Bus/Data waveform + text
- Clock positive/negative、period/phase、gating相当
- gap/spacer
- signal groups
- node/edge相当
- straight/curved/sharp/diagonal edge、arrow/bidirectional/no-arrow、label
- header/footer/tick/tock/hscale相当（GUI/Document Layoutへ再設計）

## Replace input syntax
- `wave: "0...1..0"` -> Semantic `start/value`
- `.` -> 自動継続
- `node: "...a..b"` -> semantic waveform geometry anchor
- `edge: "a->b"` -> GUI Transition Arrow
- `period/phase` -> Signal/Clock Properties GUI
- group arrays -> Signal Tree GUI
- `|` gap -> Timeline Gap GUI
- `hscale` -> Time Scale/Zoom GUI
- head/foot -> Document Layout

## Geometry rule
WaveDromの斜めedge、Bus transition、Clock、X/Z形状を「似せる」実装は禁止。Golden testsでは基本波形のSVG path座標、stroke、transition endpointsを比較し、許容差0pxを原則とする。

Annotationのclock edge snapはWaveDrom実Geometryを参照し、別計算で推測しない。
