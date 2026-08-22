# Timing Chart Editor — Sample Pack

動作確認用のサンプル10件です。各 `.tcd.json` は **1ファイル内に Cycle View と Transaction View の両方**を持ちます。

## サンプル一覧

| # | Sample | 主な確認項目 |
|---|---|---|
| 1 | APB register access | Setup/Access、wait state、PSLVERR、Range、Arrow |
| 2 | AHB-Lite pipelined transfer | Address/Data phase overlap、HREADY stall |
| 3 | AXI4 Full write burst | AW/W/B、4-beat burst、WREADY backpressure、WLAST |
| 4 | AXI4 Full read outstanding | AR/R、複数ID、outstanding、response ordering、RREADY stall |
| 5 | SRAM 1P | sync read/write、1-cycle read latency |
| 6 | SRAM 2P | 同時アクセス、Group間隔、same-address conflict表示 |
| 7 | AXI to DRAM | AXI→ACT/READ/DATA/PRE、multi-clock、fractional cycle |
| 8 | Async FIFO CDC | 異周波/位相clock、enqueue/dequeue、Gray pointer |
| 9 | Accelerator request/response | Input→Internal→Output group、overlap、error response |
| 10 | AXI4-Stream | TVALID/TREADY、backpressure、TKEEP、TLAST |

## データモデル上の意図

- Signalの値は `start` のみを記録し、次の変更点まで同じ値が継続します。
- Transaction/Rangeは時間区間なので `start` / `end` を持ちます。
- Annotationは波形上の実GeometryへAnchorし、px Offsetを別に保持する前提です。
- `signalGroups` はRoleとは独立し、任意順序・任意個数を許します。
- `spacingBefore` / `spacingAfter` を入れたサンプルがあり、Group間隔の確認に使えます。
- 例はGUI/描画機能の確認を目的としたfixtureです。プロトコル適合性検証用の正式vectorではありません。

## 推奨の表示試験

1. 全10件をロードしてエラーなく描画
2. Cycle View / Transaction Viewの切替
3. Signal Group collapse / reorder
4. Signal name alignment / width変更
5. Global / Group / Signal spacing変更
6. AnnotationのDrag、1px移動、Clock edge snap
7. Dependency Arrowの端点snap
8. Cycle挿入/削除後のAnchor追従
9. JSON自動生成とのround trip
10. SVG export後のWaveDrom geometry比較
