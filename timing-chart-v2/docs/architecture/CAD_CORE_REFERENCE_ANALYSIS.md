# CAD Core Reference Analysis

作成日: 2026-09-08

## 目的と調査範囲

本書は、Timing Chart Editor を将来の Semiconductor Semantic CAD へ拡張する際の責務分離を検討するための P0 調査結果である。
実装変更、既存GUIの再設計、既存Document schemaの置換はこの段階では行わない。

比較対象は次の2つである。

- Draftline: https://github.com/sethjuarez/draftline
- StratumCAD: https://github.com/wieslawsoltes/StratumCAD

Draftlineは一般的なCAD実装ではないため、Document/Geometryの直接参照ではなく、ユーザー意図、preflight、operation token、recovery、versioningの設計参照として扱う。
StratumCADはブラウザ向けCAD実装であり、validated document、transaction、AABB hierarchy、narrow-phase picking、renderer boundary、native JSON/DXF/SVG/PNG exportの参照として扱う。

## 結論

現行V2は、半導体タイミングチャートに特化したCanonical Document、Semantic Command、History、Projection、Geometry、Rendererの基礎をすでに持つ。
したがって、汎用CADのEntity/Line/Polylineモデルへ寄せるのではなく、次の境界を維持したまま不足するCAD能力を段階的に追加するのが適切である。

```text
Application UI
  -> application command/controller
  -> semantic command + validation + history
  -> semiconductor canonical document
  -> timing projection / local geometry
  -> renderer / export
```

優先順位は、(1) DocumentとCommand/Transactionの不変条件、(2) Geometry queryの共通化、(3) Renderer境界、(4) semiconductor semantic modelの拡張、(5) DRC/Layout/Routerである。
Spatial indexやPickingを先に導入しても、Canonical Documentを直接迂回する経路が残ればCAD化の効果は限定的である。

## 現行実装の基準

調査対象は `timing-chart-v2` の current main (`9e0e6ad`) である。

|責務|現行 owner / evidence|現状評価|
|---|---|---|
|Canonical Document / schema|`packages/schema/src` の `CanonicalDocument`、validation、migration、reference registry|半導体向けの意味モデルを持つ。唯一のSource of Truthとして維持すべき|
|Command|`packages/commands/src` の `SemanticCommand`、planner、policy|編集経路は既存Commandへ集約されている。新しいCAD操作も同じ経路へ入れるべき|
|History / Undo / Redo|`packages/history/src` の `CommandHistorySession`|snapshot参照とretentionを持つ。Transactionのatomicityを拡張する土台がある|
|Application boundary|`apps/editor/src/runtime/editor-application-runtime.ts` と application controllers|Document epoch、projection、geometry、rendererの寿命をUIから分離済み|
|Projection / display mapping|`packages/projection/src` と runtime display-mapping owner|source cycleとdisplay cycleの変換をsemantic dataから分離済み|
|Geometry|`packages/geometry/src`、`LocalGeometryMap`、`TimelineGeometryOwner`|タイミングチャートの行・cycle geometryに特化。汎用AABB queryは今後の候補|
|Picking / interaction|runtime interaction owners、timeline/tree/annotation owners|UIイベントからsemantic commandへ接続済み。candidate/narrow phaseの共通サービスは未整理|
|Snap|commands/runtimeのcycle・transaction・annotation向け処理|timing-domain snapは存在する。汎用geometry snapとは分けるべき|
|Renderer|`packages/renderer/src`、runtime render coordinator、WaveDrom adapter|Renderer lifecycleはruntime ownerに分離済み。Documentを直接mutationしない境界を維持する|
|Export|`packages/export/src`、`editor-export-controller`|Canonical snapshotからSVG/PDF等を生成する。exportはread-only consumerとして維持|
|AI|`apps/editor/src/ai-*`、proposal/validation/apply flow|Semantic proposal -> validation -> commandの流れがある。raw SVG/geometry mutationは禁止する|
|DRC / routing / layout|現行の主対象外|将来の半導体semantic rule / timing-specific diagnosticsとして新設する|

## 15領域比較

|領域|Current implementation|Reference implementation|Problem / gap|Recommended design|Migration difficulty|Risk|
|---|---|---|---|---|---|---|
|1. Document Model|`CanonicalDocument`にtimeline、signals、groups、transactions、annotations、presentationを保持|StratumCADはvalidated Float64 geometry entity mapとlevelsをnative documentに保持。DraftlineはWorkspace/Version/Variationを製品語彙として公開|半導体semantic entityと表示geometryが同一Document内で近接している。Draftlineのような操作境界も不足|Canonical semantic modelを正とし、render scene / derived geometryを別snapshotにする。保存対象とsession-only stateを明示する|中|既存`.tcd`互換性、GUI表示の回帰|
|2. Entity ownership|schema、application、projection、rendererに責務分散。runtime ownerを導入済み|StratumCADの`document.js`がvalidation/transactions/history/native format、`geometry.js`がgeometry/index、`renderer.js`が描画|新しいUIがDocument配列やrenderer cacheを直接参照すると再肥大化する|entity IDと所有packageをregistry化し、UIはtyped selector/controllerだけを使う|低〜中|既存propsの迂回経路|
|3. Command execution|SemanticCommand -> planner -> History -> Canonical|StratumCADはkey-in/toolをdocument transactionへ接続。Draftlineはbusiness intentをsafe APIへ変換|操作ごとのpreflight/result/safe-next-actionがまだ一様ではない|`CommandIntent`、validation、`CommandResult`、changeSetを維持し、危険操作だけpreflight/tokenを追加|中|API二重化、History semantics変更|
|4. Transaction|batch commandとatomic rejection、history snapshot|StratumCADはtransaction開始時snapshot、validation、rollback、observer failure isolation|multi-domain操作で影響範囲・rollback証跡を明示する余地|既存`executeBatch`をTransaction boundaryとして整理し、affected entities、inverse、postconditionを型化|中|大規模snapshotコスト|
|5. Undo / Redo|`CommandHistorySession`にundo/redo、retention、document replacement|StratumCADはsparse before/after historyとbranched-history invalidation。Draftlineはrestoreをhistoryを巻き戻さない新しいsaveとして扱う|document replace、restore、branch的操作の意図が異なる|編集UndoとDocument restore/versionを別概念にし、restoreは通常Commandまたは新revisionとして扱う|中|既存ユーザーのUndo期待|
|6. Selection|Selection ownerとselection actions、stable IDs|StratumCADはclick、shift toggle、group、directional box selectionをdocument queryに接続|selection candidate queryとUI selection stateが同一経路になりやすい|SelectionModelをsemantic IDsだけで保持し、candidate providerをspatial/picking serviceへ分離|中|panel同期、stable DOM contract|
|7. Spatial index|timeline geometry mapsと局所geometry cacheはあるが、汎用spatial index ownerは未確立|StratumCADはbulk-built AABB tree、編集後rebuild|現在は全件/局所検索が混在し、将来のannotation/net/DRC queryで重複実装の恐れ|最初はimmutable AABB broad-phase interfaceをgeometry packageに導入。rebuild/incremental更新は後段|中|timing projectionとsource/display座標の混同|
|8. Picking|runtime interaction ownerがsurface geometryとcycle mappingを使う|StratumCADはAABB candidate -> geometric narrow-phase。表示幅とhit areaを分離|細いannotation/edgeのhit policyが各ownerに散る可能性|`PickQuery`/`PickCandidate`/`HitTestResult`をsemantic IDに対して定義し、cycle-domain pickingはadapter化|中|pointer gesture挙動の変更|
|9. Snap|cycle、transaction、annotation向けdomain snap|StratumCADはendpoint/midpoint/center/intersection/grid/ortho snap|汎用CAD snapとtiming snapは意味が異なる|共通の候補/許容誤差インターフェースだけ共有し、実際のsnap ruleはsemiconductor domain ownerに残す|中|snap結果の既存pixel契約|
|10. Geometry|projection/local geometry/screen mappingがtiming semanticsから派生|StratumCADはanalytic primitives、tessellation、offset、triangulation、hatch、AABB|geometryをsemantic truthに逆流させると意味が壊れる|`Semantic -> LayoutGeometry -> RenderScene`の一方向変換を明文化。逆変換は操作入力の解釈に限定|中|layout編集の仕様混入|
|11. Renderer separation|renderer packagesとruntime coordinator。export sceneもsnapshotから生成|StratumCADはrendererがdocument revision等でbatch invalidationし、Canvas fallbackを持つ|renderer cache invalidationとsemantic revisionの契約をさらに明文化できる|renderer inputをimmutable scene/projectionに固定し、mutation APIを持たせない|低〜中|性能回帰、WaveDrom互換|
|12. UI → Model mutation|UI/controllerからapplication.execute、SemanticCommand、Historyへ|Draftlineはinspect -> preflight -> execute -> verifyを標準operation modelにする|UI側でID生成・command assemblyが残る場所がある|presentationはintent/controller APIを呼び、ID・command・transactionはapplication ownerへ集約|中|既存action wiring、Undo entry数|
|13. Serialization|schema parser/migration/validated serialization、export packages|StratumCADはlossless native JSONを正とし、DXF/SVG/PNGは制約を明示。Draftlineはcontent policyで保存対象を制御|semantic、presentation、session stateの保存境界が増えると曖昧になる|format version、unknown field preservation、session exclusion、round-trip testを継続|低〜中|既存fixtureの互換性|
|14. Export|Canonical snapshot -> ExportScene -> SVG/PDF/other|StratumCADはnative formatをlossless、交換形式は近似・unsupportedを報告|exportの情報損失・geometry approximationを明示する必要|export contractにsemantic loss reportとdeterministic scene inputを追加検討|低|既存golden/byte determinism|
|15. DRC integration|現行はschema validation、diagnostics、command policy中心|StratumCADはschema validation、geometry analysis、spatial queryを持つ。Draftlineはpreflight blockers/recoveryをfirst-classにする|geometry DRCとsemiconductor DRCの境界が未定義|`GeometryDrc`と`SemiconductorDrc`を分離し、双方をread-only diagnosticとしてCommand/Transaction postconditionへ接続|高|誤検知を編集拒否へ直結する危険|

## Draftlineから採用する設計原則

Draftlineの直接の対象はGit-backed workspaceであり、Timing ChartのDocumentとは異なる。ただし、次の原則は適用可能である。

1. **意図をAPI名にする**: UIからstorage/geometry primitiveへ直結せず、`save`, `restore`, `apply`, `preflight`のようにユーザー意図を表現する。
2. **read-only inspectionを先にする**: diagnostics、preview、diff、candidate queryはDocument mutationなしで実行できるようにする。
3. **危険な操作にpreflightを要求する**: document replace、bulk edit、reroute、purge相当はaffected entities、blockers、safe next actionを返す。
4. **opaque IDとoperation identity**: branch/refや配列位置をsemantic identityに使わない。既存stable ID方針を維持する。
5. **recoveryを通常の成功経路の外に置かない**: interrupted transactionやstale async renderを診断可能なoperation/document epochとして保持する。
6. **partial coverageを明示する**: Draftlineのscenario matrixのように、supported / partial / unsupportedをテストと一緒に文書化する。

## StratumCADから採用する設計原則

1. **validated Documentとgeometry kernelを分ける**: Document validation、geometry calculation、rendererを別ownerにする。
2. **AABB broad phase + exact narrow phase**: Selection、Picking、DRC、routing obstacle queryを共通query protocolにする。
3. **transaction rollbackをDocument境界で行う**: renderer observerの失敗でcanonical commitを不成立にしない。逆にsemantic validation失敗はcommit前に拒否する。
4. **render invalidationはrevision依存**: camera-only変更、selection変更、document revision変更を区別し、全scene再構築を避ける。
5. **lossless native formatを正とする**: SVG/DXF/PDFなど交換形式は近似・unsupportedを明示し、semantic dataを失わない。
6. **fallbackを明示する**: renderer backendの違いをDocument semanticsに混ぜず、actual backend/capabilityをdiagnosticで公開する。

## Semiconductor Semantic CADへの適用方針

汎用CADのgeometryを中心に据えず、以下をsemantic truthとする。

```text
Signal / Clock / Bus / State / Event
Transaction / Annotation / TimeGroup
Module / Port / Net / ClockDomain / Constraint (future)
        ↓
Timing projection / Layout geometry
        ↓
SVG / Canvas / WaveDrom / PDF export
```

将来 `Module`、`Port`、`Net`、`ClockDomain` 等を追加する場合も、まずschema上のsemantic entityとcommandを追加し、geometryは派生物として生成する。
MUX、DFF、CDC bridgeなどを単なるPolygonやSVG pathで保存しない。geometry-only importが必要な場合も、semantic entityへ変換できない要素は明示的なexternal/unknown entityとして保持し、黙って意味を捨てない。

## 段階的Migration Plan（実装は次Goal以降）

### M0: characterization

- Canonical snapshotの変更前後不変条件をfixture化
- command、history、dirty、selection、renderer invalidationの観測値を記録
- save/reloadでsemantic fieldsが失われないことを確認

### M1: query boundary

- `SpatialQuery`のread-only interfaceをgeometry packageに追加
- 既存timeline geometryをadapterとして実装
- まずselection/pickingだけをcandidate queryへ移す

### M2: transaction boundary

- `executeBatch`をtyped transaction resultとして表現
- affected entity IDs、preflight blockers、postcondition diagnosticsを追加
- 既存History semanticsを変えずにrollback characterizationを拡張

### M3: semantic/layout boundary

- semantic documentからrender/layout snapshotを作る一方向mapperを明文化
- renderer/exportはsnapshotをconsumeするだけにする
- UIの直接geometry mutationをguardする

### M4: semiconductor model expansion

- Module/Port/Net/ClockDomain/Constraintをschema・command・validationの順に追加
- Layout、Router、Geometry DRC、Semiconductor DRCを別packageへ配置
- AIはSemantic Patchだけを生成する

## P0で採用しないもの

- DraftlineのGit/ref/recovery実装をそのまま移植しない
- StratumCADの汎用Line/Polyline中心Documentへ置換しない
- 既存WaveDrom/timing projectionを汎用CAD geometryへ置き換えない
- P0ではSpatial Index、Router、DRC、Module schemaを実装しない
- Golden、threshold、mask、既存GUI仕様を変更しない

## 調査ソース

- Draftline README: https://github.com/sethjuarez/draftline/blob/main/README.md
- Draftline scenario contract: https://github.com/sethjuarez/draftline/blob/main/docs/scenarios.md
- Draftline API plan: https://github.com/sethjuarez/draftline/blob/main/docs/api-plan.md
- StratumCAD README: https://github.com/wieslawsoltes/StratumCAD/blob/main/README.md
- StratumCAD source map / renderer architecture / model-kernel boundaries: 同README内の `Renderer architecture`、`Model/kernel boundaries`、`Source map` 節

調査時点: 2026-09-08。参照プロジェクトの仕様・実装は更新され得るため、実装着手時にはcommit SHAを固定して再確認する。
