# READMEデモの再生成

デモはProduction buildのUIを操作し、1440×900、DPR 1で録画します。
runごとに専用ポートのpreview serverを起動するため、通常の開発ブラウザには接続しません。
Canonicalへの直接書き込みやデモ用のProduction分岐は使いません。

## Transaction Viewの録画

依存を導入済みの作業環境で、`timing-chart-v2`から実行します。

```powershell
node scripts/capture-readme-demos.mjs --grep transaction-view
```

録画は`artifacts/readme-demo-capture/transaction-view.webm`へ保存されます。
同名のJSONには準備完了後の開始位置を記録し、GIF化では起動中の区間だけを除きます。
Cycle View、Transaction View、Combined Viewの順に切り替えます。
UIの準備完了はassertionで確認し、表示後の短いpauseは読者が画面を見るために設けています。
console errorまたはpage errorが発生した場合、captureは失敗します。

## GIFの作成

ffmpegをPATHへ追加するか、実行ファイルを`FFMPEG_PATH`で指定します。

```powershell
node scripts/encode-readme-demos.mjs transaction-view
```

12 fpsのpalette生成とpalette適用を使い、`docs/assets/demo/transaction-view.gif`を作成します。
既存GIFの上書きは拒否します。
更新時は旧GIFを保管してから、新しい録画をエンコードしてください。

## 公開前の確認

GIFの全区間を再生し、文字の欠け、空白画面、残留dialog、エラー表示がないことを確認します。
ローカルパス、個人名、tokenが映っていないことも確認します。
実際の不具合が映った場合は編集で隠さず、Issueへ記録します。

Feature GIFは4 MB以下を目安にし、7 MBを超える場合はsequenceを見直します。
READMEへの埋め込みは生成と目視確認が完了してから行います。
現在はHero、Quick Start、Transaction View、Measurement、Timeline Edit、Annotation、Scenario Compare、Exportの8本を生成しています。
READMEとマニュアルの整合性確認、全GIFの最終レビューは別の完了条件であり、生成だけで#1098の完了を意味しません。

## 全デモの再生成

```powershell
node scripts/capture-readme-demos.mjs --grep 'hero-timing-chart$|quick-start$|transaction-view$|measurement$|timeline-edit$|annotation$|scenario-compare$|export$'
node scripts/encode-readme-demos.mjs hero-timing-chart quick-start transaction-view measurement timeline-edit annotation scenario-compare export
```

captureは各ケースを独立したブラウザ状態で開始します。
録画とJSONは`artifacts/readme-demo-capture`、Playwrightの失敗証跡は`test-results/readme-demo`へ保存します。
再エンコード前に既存GIFを退避してください。
Heroは18.5秒、8,634,120 bytesで、8 MBの目安を超えていますが12 MBのreview threshold内です。
HeroのTransactionは作成フォームからsource cycles 3から9を指定し、Combinedで表示幅を確認します。

## Measurementの録画

```powershell
node scripts/capture-readme-demos.mjs --grep 'measurement$'
node scripts/encode-readme-demos.mjs measurement
```

captureスクリプトは毎回Production buildを更新してから録画します。
Newで標準Signalを持つ文書を作り、Document Propertiesで基準周波数100 MHzと表示単位nsを設定します。
Annotationの「Pick measurement endpoints」でREQUESTのCycle 3とREADYのCycle 5を選びます。
ラベルの「Δ 2 cycles (20 ns)」と、overlay選択後のInspectorが同じAnnotation IDを持つことを検証します。
IDの解決には作成前後のstable ID集合の差を使い、DOMの末尾や表示順は使いません。

生成したGIFは1440×900、12 fps、約11秒、6,341,470 bytesです。
4 MBの目標値は超えていますが、7 MBのreview threshold内です。
全区間のcontact sheetと等倍のラベル表示を確認しました。

## 最初の生成記録

2026-10-09にmain `c59cb3d`のProduction buildでTransactionデモを生成しました。
専用preview serverでcaptureを実行し、console errorとpage errorは0件でした。
準備完了後からのGIFは1440×900、12 fps、約11.7秒、5,408,486 bytesです。
4 MBの目標値は超えていますが、7 MBのreview threshold内です。
全区間のcontact sheetで起動時の空白が除かれたことを確認しました。
最終READMEへの採用前に、等倍での文字とmode切替の最終レビューを行います。
