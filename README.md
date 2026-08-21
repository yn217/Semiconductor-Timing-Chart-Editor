# Semiconductor Timing Chart Editor

半導体チップ仕様書向けのタイミングチャート作成ツール。既存の回路図CADとは別アプリケーションとして実装する。

## 目的
- WaveDromの波形描画品質・表現力を活かす
- 文字位置依存の編集を廃止し、`start` ベースの意味データで編集する
- Cycle View / Transaction View / Split View
- 信号・注釈・凡例・遷移矢印をGUIで直接編集
- JSONは保存・交換・AI連携用で、通常UIでは意識させない

## 主要ドキュメント
- `docs/PRODUCT_SPEC.md`
- `docs/DATA_FORMAT.md`
- `docs/WAVEDROM_COMPATIBILITY.md`
- `docs/GUI_SPEC.md`
- `docs/IMPLEMENTATION_PLAN.md`
- `gui-mockup/` — AIがDOM/CSSとして解析可能なGUIモックアップ

## Golden Samples
- Protocol/use-case 10例: APB, AHB-Lite, AXI4 Full Write/Read, SRAM 1P/2P, AXI→DRAM, Async FIFO, Accelerator, AXI4-Stream
- Feature coverage 10例: Signal types, Group Bands/Spacing, Label layout, Annotation, Transition Arrow, Clock/Gap, Ripple edit, Legend/Group order, Header/Footer/Export, Transaction/Cycle linked views

波形形状は独自に「似せて」実装せず、WaveDrom Renderer/Skinを利用するか、SVG geometryをGolden Referenceとして0px差分を原則に比較する。
