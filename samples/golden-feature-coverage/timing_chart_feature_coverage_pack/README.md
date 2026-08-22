# Timing Chart Editor — Feature Coverage Sample Pack

前回のプロトコル中心10例とは別に、**機能網羅確認専用の10例**です。

## 11–20

| # | 目的 |
|---|---|
| 11 | Signal種別 / i-o-wire / X-Z / State / 凡例 |
| 12 | Group背景色 / Global・Group・Signal間隔 / Spacer |
| 13 | Signal名 Left/Center/Right、長文、列幅、Overflow |
| 14 | Annotation全種類（Text/VLine/Range/Bracket/Highlight） |
| 15 | 信号遷移矢印、Rising/Falling Anchor、直線/直交/曲線/斜線 |
| 16 | 複数Clock、Period/Phase、DDR、Gate、Gap/Collapse |
| 17 | Cycle挿入/削除/Ripple/UndoとAnchor追従 |
| 18 | 任意Group順、同Role複数Group、凡例自由配置 |
| 19 | Header/Footer長文、Note、SVG/PNG/PDF Export |
| 20 | Transaction/Cycle/Split、重複Transaction、Pipeline、相互Highlight |

`coverage_matrix.csv` は各FeatureをどのFixtureが踏むかの一覧です。

### 前回の10例との使い分け
- `TimingChartEditor_10_Samples.zip`: APB/AHB/AXI/SRAM等の実ユースケース確認
- このPack: UI/Renderer/保存/編集機能の網羅確認

両方をAcceptance Testに使うことで、「プロトコルらしく見える」だけでなく、
細かなGUI機能やAnchor/Spacing/Document Layoutまで抜けなく確認できます。
