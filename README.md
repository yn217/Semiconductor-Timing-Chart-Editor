# Semiconductor Timing Chart Editor

半導体チップ仕様書向けのタイミングチャート作成ツール。

## Source of truth
- `docs/PRODUCT_SPEC.md`
- `docs/DATA_FORMAT.md`
- `docs/WAVEDROM_COMPATIBILITY.md` — WaveDrom signal geometry is normative
- `docs/GUI_SPEC.md`
- `docs/GUI_VISUAL_CONTRACT.md` — Golden GUI layout is normative
- `docs/IMPLEMENTATION_PLAN.md`

## Critical visual rules
1. Cycle waveform traces use WaveDrom/default-skin geometry; custom lookalike digital paths are not accepted.
2. Original GUI mockups are Visual Acceptance references, not loose inspiration.
3. The desktop UI uses Ribbon + Left Signal Tree + Center Waveform/Bottom Editor + Right Inspector.
4. Role badges `[i]` / `[o]` / `[wire]` stay outside the waveform trace region.
5. Semantic data uses `start/value`; WaveDrom `wave` strings are temporary render input only.

See Epic #2 and the implementation issues for work breakdown.
