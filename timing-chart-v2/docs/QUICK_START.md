# Quick Start — 5分で最小のタイミングチャートを作る

Semiconductor Timing Chart Editor で、最小限のタイミングチャートを作成して保存・出力するまでの手順です。

> このページは「まず波形を描きたい」人向けです。各機能の詳しい説明は [USER_MANUAL.md](./USER_MANUAL.md) を参照してください。

## 1. 画面の見方

基本画面は次の領域で構成されます。

| 領域 | 用途 |
|---|---|
| 上部 Ribbon | New / Open / Save、Signal追加、Timeline、Annotation、View、Review、AI など |
| 左 Signal Tree | Signal / Group の選択・並び・表示 |
| 中央 Timing Canvas | 波形、Ruler、Grid、Annotation、Transaction |
| 下 Bottom Editor | 選択した Signal の値、Clock、Annotation、Bookmark、Transaction、Problems、JSON、AI の詳細編集 |
| 右 Inspector | 選択した対象の軽量なプロパティ編集 |

初めて使う場合は **Cycle View** のまま作業します。

## 2. 新しいチャートを作る

1. **Home → New** を押します。
2. 既に編集内容がある場合は、表示される確認に従って保存または破棄します。
3. 右上の View Mode が **Cycle** になっていることを確認します。

Signalを配置するにはSignalが所属する Group が必要です。空の文書の場合は、先に Group を1つ作成します。

## 3. Groupを作る

**Insert** または左側の **Add** から **Group** を追加します。

例:

~~~
Control
~~~

Group は Input / Output の意味ではありません。
Group はチャート上での整理・見せ方で、Signal の Input / Output / Internal Role とは独立しています。

## 4. Clockを追加する

Groupを選択した状態で **Clock** Signal を追加します。

追加直後は標準的なClock設定が入っています。まずはそのままで構いません。

必要なら Signal を選択し、Bottom Editor の **Signal** を開いて Clock Generator を編集します。

| 項目 | 意味 |
|---|---|
| Start | Clock開始Cycle |
| Period | 周期 |
| Duty | Duty比 |
| Phase | 位相 |
| Initial | 初期レベル |
| Polarity | 極性 |

Clockは通常のイベント列を手入力するのではなく、Generator設定から波形を生成します。

## 5. Binary Signalを追加する

次に VALID と READY の2本を追加します。

~~~
CLOCK
VALID
READY
~~~

Signal名やRoleは右 Inspector から変更できます。

Roleの代表例:

- Input → i
- Output → o
- Internal → wire

Roleは表示上のGroupとは別の属性です。

## 6. VALIDの波形を入力する

左の Signal Tree で VALID を選択します。

Bottom Editor の **Signal** タブに **Add new transition** と **Transitions** が表示されます。

次の3点を入力します。

| Start (cycle) | Value |
|---:|---:|
| 0 | 0 |
| 2 | 1 |
| 5 | 0 |

入力方法:

1. **Start (cycle)** に 0
2. **Value** に 0
3. **Add**
4. 同様に Cycle 2 → 1
5. Cycle 5 → 0

このアプリでは「各Cycleの値」を全部保存するのではなく、**値が変化する点だけ**を保存します。

~~~
0: 0
2: 1
5: 0
~~~

これは次の意味です。

~~~
Cycle 0–1 : 0
Cycle 2–4 : 1
Cycle 5–  : 0
~~~

Transitions表の **End** と **Duration** は計算結果です。通常は Start と Value を編集します。

## 7. READYの波形を入力する

READY を選択し、同じように次を入力します。

| Start (cycle) | Value |
|---:|---:|
| 0 | 0 |
| 3 | 1 |
| 5 | 0 |

これで中央Canvasに、Clock / VALID / READY の基本的なハンドシェイク波形が表示されます。

## 8. Cycle数が足りない場合

上部の **Timeline** タブで時間軸を追加できます。

よく使う操作:

- **Add Cycle** — 1 Cycle追加
- **Add N** — 複数Cycle追加
- **Before / After** — 選択範囲の前後へ挿入
- **Delete** — 選択範囲を削除
- **Duplicate** — 範囲を複製
- **Move** — 範囲を移動

Timeline編集では、後ろにあるSignal変化点・Annotation・Bookmark・Transaction等も同じ時間軸ルールで追従します。

## 9. 表示を見やすくする

**View** タブで次を調整できます。

- Grid
- Snap
- Ruler
- Zoom 50 / 100 / 150 / 200 / 400 / 800%
- Fit All
- Fit Selection
- Signal Tree / Inspector / Bottom Editor の表示
- Bottom Compact / Expanded
- Focus Waveform
- MiniMap
- Signal Split

画面が狭い場合は **Focus Waveform** を使うとCanvasを大きく表示できます。

## 10. 保存する

**Home → Save** または **Save As** を使います。

タイミングチャートはCanonical JSON形式で保存されます。

重要な考え方:

- 波形は start / value の変化点として保存
- 画面上の絶対X/Y座標は原則保存しない
- Undo / Redo可能な編集は履歴管理される
- View-only操作は文書のDirty状態を変更しない

## 11. SVG / PNG / PDFへ出力する

**Export** を開きます。

| 設定 | 内容 |
|---|---|
| Format | SVG / PNG / PDF |
| Scope | Entire Document / Selected Range |
| Page Size | A4 / Letter / Wide |
| Orientation | Landscape / Portrait |
| Fit | Fit Width / Fit Page |
| Fold Policy | Axis Breakを維持 / 展開 |
| PNG Scale | 1x / 2x / 3x |

クリップボードへ **Copy SVG / Copy PNG** もできます。

仕様書や設計資料へ貼る場合は、編集しやすい **SVG** を最初に試すのがおすすめです。

## 12. 次に覚えると便利な機能

最低限の波形を描けたら、次の順に覚えると使いやすくなります。

1. Bus / State Signal
2. Group / Spacer / Signal spacing
3. Bookmark
4. Annotation / Measurement
5. Cursor A / B
6. Time Group / Axis Break
7. Transaction / Combined View
8. Scenario
9. Problems / Review
10. AI Assistant

詳しくは [USER_MANUAL.md](./USER_MANUAL.md) を参照してください。
