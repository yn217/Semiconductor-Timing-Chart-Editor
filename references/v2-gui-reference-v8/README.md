# Timing Chart V2 GUI Reference Pack v8

Golden `golden-home-cycle-1672x941.png` との差をReference HTML側で詰めた版です。

## v5でGoldenへ合わせた主な点
- Left Signal/Groupに表示/非表示 Eye iconを復元し、実際にwaveform rowをshow/hide
- Group collapseはSVG Chevron。Left Treeだけを開閉し、waveform visibilityとは分離
- Group / Signal row右端に三点メニュー
- Commentは専用speech-bubble SVG
- Centerを Golden同様 `Role` と `Signal / Annotation` の独立列へ分離
- Roleは `i / o / wire`
- `Time Scale: Cycle` / `Reference: clk` header
- cycle 0の青いcursor
- RibbonをGoldenに近い File / Edit / Time / Layout / Zoom / Display / Options 構成へ
- InspectorにText Color / Background / Font / Size / Bold / Italic / Underline / Strikethrough / Alignを追加
- MiniMapをRight下端固定
- BottomをSignal Editor / Annotations / Checks / JSONへ
- 1672x941の主要region寸法を`gui-reference.json`へ記録

## 起動
```powershell
cd timing-chart-v2-gui-reference-v5
python -m http.server 8080
```
`http://localhost:8080/`

## Self check
```powershell
node check-reference.mjs
```

## 注意
これはVisual / Interaction Referenceです。Productionへ移植する際はV2のCanonical / SemanticCommand / WaveDrom / ChangeSet architectureを維持してください。


## v6 — Golden row alignment correction

The previous AI-generated Golden itself had a defect:
Role / Signal labels were one waveform row too high.

Cause:
- Waveform: `header + 31px ruler + rows`
- Role/Signal: `header + rows`

Fix:
- Role and Signal/Annotation now both have a 31px `label-ruler-spacer`.
- Their row Y positions are browser-verified against waveform row Y positions.
- The old AI-generated image is retained only as:
  `golden-ai-original-DEPRECATED.png`
- The new `golden-home-cycle-1672x941.png` is generated from the corrected HTML in Chromium, so the browser reference and Golden cannot drift at creation time.

`layout-metrics.json` contains the measured row alignment.


## v7 — Ribbon Golden correction

- Time / Layout / Zoom のアイコンをGolden系の細線SVGへ再統一
- Cycle Insert/Delete, N Cycle Insert/Delete は明示的な2行ラベル
- Align Interval / Auto Layout / Zoom Out / Zoom In / Fit All もGoldenに合わせた2行表示
- Displayをcompact 2段へ変更
  - 1段目: Grid / MiniMap
  - 2段目: Snap / Ruler
  - **Gridの真下にSnap**
  - Snapはcheckbox-style
- OptionsのMoreを独立
- Ribbon横スクロール禁止
- v6のRole / Signal / Waveform Y alignment修正は維持

Checks:

```powershell
node check-reference.mjs
node check-ribbon-v7.mjs
```


## v8 — Bottom toolbar icons / shared role badge width

### Bottom Signal Editor
Unicode/文字代替アイコンを廃止し、inline SVGへ統一しました。

- Duplicate = overlapping documents
- Import... = arrow down to tray
- Export... = arrow up from tray
- Preview = eye
- Presetsも同じSVG visual languageへ統一

### Role badges
Left TreeとCenter Role columnで同じCSS tokenを使用します。

- input `i` = 28px
- output `o` = 28px
- internal `wire` = 42px
- comment = 24px

ブラウザ実測でLeft/Center width差 0px をAcceptanceとします。

### Checks

```powershell
node check-reference.mjs
node check-ribbon-v7.mjs
node check-v8.mjs
```
