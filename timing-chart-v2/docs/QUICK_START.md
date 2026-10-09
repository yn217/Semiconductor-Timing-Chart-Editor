# 5分で最初のタイミングチャートを作る

Cycle ViewでCLOCK、VALID、READYを作り、変化点を入力して保存する手順です。
アプリの起動方法は[リポジトリのREADME](../../README.md)を参照してください。

![3信号の作成と変化点編集](assets/demo/quick-start.gif)

## 変化点の編集モデル

Signalには各Cycleの値を全部入力する必要はありません。
値が変わるCycleを`start`、その位置から続く値を`value`として追加します。
例えば`0:0, 2:1, 5:0`は、Cycle 0から1が0、Cycle 2から4が1、Cycle 5以降が0という波形です。

## 1. 標準Signalを削除する

右上でCycle Viewを選び、File → Newを押します。
編集中の文書がある場合は、保存確認に従ってください。
Newには標準Signalが入るため、3信号だけのチャートを作るにはHome → Select All Signals → Deleteを選びます。
左パネルのSignal一覧が空になったことを確認します。

## 2. GroupとClockを作る

左パネルのAdd → Groupを選びます。
InspectorのGroup名に`Handshake`を入力し、Applyで確定します。
Add → Clockを選び、InspectorのSignal名を`CLOCK`にしてEnterで確定します。
Use as Reference Clockを押し、下部のTime Axis表示がCLOCKを示すことを確認します。

Clockは変化点を手入力せず、周期、Duty、位相などの設定から波形を生成します。
この手順では追加直後の設定を使います。

## 3. VALIDを作る

Add → SignalでBinary信号を追加します。
Inspectorで名前を`VALID`に変え、Enterで確定します。
下パネルのSignalエディタでStartとValueを入力してAddを押します。
新しいBinary信号にはCycle 0の値0が入っているため、その初期点を重ねて追加する必要はありません。

| Start (cycle) | Value | 操作 |
|---:|---:|---|
| 0 | 0 | 追加済みの初期値を確認 |
| 2 | 1 | 入力してAdd |
| 5 | 0 | 入力してAdd |

中央のVALID波形がCycle 2で上がり、Cycle 5で下がることを確認します。
EndとDurationは次の変化点から計算される表示です。

## 4. READYを作る

Add → Signalを選び、名前を`READY`に変えてEnterで確定します。
同じ方法で次の変化点を入力します。

| Start (cycle) | Value | 操作 |
|---:|---:|---|
| 0 | 0 | 追加済みの初期値を確認 |
| 3 | 1 | 入力してAdd |
| 5 | 0 | 入力してAdd |

CLOCK、VALID、READYの3本と、それぞれの変化点を確認します。
信号を選ぶとInspectorと下パネルがその信号の編集内容を表示します。

## 5. 保存する

File → Saveで文書を保存します。
保存した文書はFile → Openから開いて再編集できます。
画像出力だけでは再編集用の文書保存を代替できないため、先にSaveを行います。

## 6. SVGを出力する

File → Exportを開きます。
FormatをSVG、ScopeをEntire DocumentにしてExport SVGを押します。
ダウンロードしたSVGを仕様書や設計資料へ貼り付けます。
PNGやPDFが必要な場合は同じダイアログで形式を切り替えます。

![出力形式と範囲の設定](assets/demo/export.gif)

## 次に試す機能

時間関係を示す場合はAnnotationのMeasurement、期間を整理する場合はTransaction ViewとCombined Viewを試せます。
各機能の実操作例は[README](../../README.md)、デモの再生成手順は[README_DEMOS.md](README_DEMOS.md)にあります。
