# Semiconductor Timing Chart Editor — User Manual

このマニュアルは、Semiconductor Timing Chart Editor のリリース版を利用して、半導体仕様書向けのタイミングチャートを作成・編集・レビュー・出力するための機能リファレンスです。

最初に簡単なチャートを作りたい場合は [QUICK_START.md](./QUICK_START.md) を先に参照してください。

# 1. このアプリの基本思想

Semiconductor Timing Chart Editor は、一般的なドローソフトではなく、**半導体仕様書のタイミング情報を意味付きデータとして編集するツール**です。

主な設計原則:

- Signal波形は各Pixelではなく **変化点 start / value** で保存します。
- Cycle挿入・削除はExcelの列操作のように時間軸全体へ作用します。
- Signal、Annotation、Bookmark、Transaction等は可能な限りStable IDで参照します。
- Waveformの形状はWaveDrom由来の実Geometryを使用します。
- AnnotationやMeasurementは見た目だけではなくSemantic Anchorを持ちます。
- ViewのZoom / Scroll / Panel表示などは、原則としてCanonical文書を変更しません。
- JSONは通常操作の中心ではなく、確認・高度な編集用です。

# 2. 主要な用語

| 用語 | 意味 |
|---|---|
| Canonical Document | 保存対象となるタイミングチャートの正式データ |
| Cycle | Source timeline上の基本時間単位 |
| Transition | Signalの値が変化する点 |
| Role | Input / Output / Internal 等のSignal意味 |
| Group | 表示上のSignal整理単位。RoleやRTL hierarchyとは独立 |
| Semantic Anchor | Cycle境界、transition、clock edge等に意味で結び付く位置 |
| Bottom Editor | Event / Phase / Annotation等の詳細編集領域 |
| Inspector | 選択対象の軽量プロパティ編集領域 |
| View-only state | Zoom / Scroll / Cursor / Pin等、文書を変更しない状態 |
| History | Undo / Redo対象となるSemantic編集履歴 |

# 3. 画面構成

## 3.1 Ribbon

上部Ribbonには、機能ごとのタブがあります。

代表的なタブ:

- Home
- Insert
- Timeline
- Annotation
- View
- Review
- AI

Homeには頻繁に使うNew / Open / Save / Undo / Redo / Cut / Copy / Paste / Delete / Duplicate / Select All / Zoom / Fit / Grid / Snap / Ruler等があります。

## 3.2 Signal Tree

左側にはSignal / Groupの構造が表示されます。

主な用途:

- 選択
- 複数選択
- Group展開/折りたたみ
- 並べ替え
- 表示/非表示
- Group移動
- Signal Pin
- Group / Hierarchy 表示切替

## 3.3 Timing Canvas

中央上部が波形の主作業領域です。

表示されるもの:

- Signal waveform
- Ruler
- Grid
- Playhead / Range
- Cursor A / B
- Annotation
- Measurement
- Bookmark marker
- Time Group / Axis Break
- Transaction
- Legend

## 3.4 Bottom Editor

中央下部は詳細編集領域です。

選択内容やView Modeに応じて、Signal / Transaction / Phases / Linked Signals / Annotation / Bookmarks / AI Assistant / Problems / JSON 等を使います。

通常はSelectionに追従します。
**Pin** または **Follow Selection OFF** を使うと、Bottomの対象を固定できます。

## 3.5 Inspector

右側は選択対象の軽量プロパティ編集です。

基本的な役割分担:

~~~
Inspector = 選択対象のProperty / Summary
Bottom    = 時間データ / List / Bulk / Detailed edit
~~~

# 4. File操作

## 4.1 New

**Home → New**

新しいCanonical Documentを作成します。

編集中の変更がある場合は、誤って失わないよう確認が入ります。

## 4.2 Open

**Home → Open**

保存済みTiming Chartファイルを開きます。

Openは現在のDocumentを置換する操作です。
失敗時には現在の文書を壊さず、Problems等へ理由を表示する設計です。

Production Openには入力ファイルのResource Budgetがあり、極端に大きなJSONは読み込み前に拒否されます。

## 4.3 Save / Save As

**Home → Save / Save As**

Canonical DocumentをJSON系ファイルとして保存します。

保存されるのはSemantic/Persistentな情報です。Zoomや通常のScroll位置などの一時表示状態はCanonicalには入りません。

# 5. View Mode

画面上部のView Modeは次の3種類です。

## 5.1 Cycle View

通常のSignal waveform編集モードです。

Signal値編集、Clock、Annotation、Measurement、Timeline編集の基本モードです。

## 5.2 Transaction View

Transaction / Phase / Laneを中心に表示します。

長いProtocol処理、Burst、Pipeline、複数Phaseの意味をSignalレベルより上位で整理する場合に使います。

## 5.3 Combined View

TransactionとCycle waveformを同じSource Time Axis上で上下に表示します。

内部実装や古い資料では Split と記載される場合がありますが、ユーザー向け名称は **Combined** です。

CycleとTransactionは同じ時間軸を共有し、Zoomや水平位置を合わせて比較できます。

# 6. Signalの追加と種類

InsertまたはSignal TreeのAddからSignalを追加します。

| Type | 用途 |
|---|---|
| Binary | 0 / 1 / X / Z |
| Logic | Logic系値 |
| Bus | 数値、Hex、Binary、Symbolic、X/Z |
| State | 状態名、Enum |
| Event | Event / Pulse的なイベント列 |
| Clock | Generatorから生成するClock |
| Comment Row | 波形ではない説明行 |

Pulse列を作りたい場合、通常はBinary Signalの **Generate Waveform** を使って生成します。

# 7. Signal Role

代表的なRole:

- Input
- Output
- Internal

表示は i / o / wire のBadgeとしてSignal Nameとは別列に出ます。

重要:

~~~
Role  ≠ Group
Role  ≠ RTL Instance Hierarchy
~~~

Groupを移動してもSignalのRoleやHardware source identityは変わりません。

# 8. Signal Event Table

Signalを選択し、Bottom → **Signal** を開くとEvent Tableを編集できます。

## 8.1 変化点モデル

通常Signalは次のように保存されます。

~~~
start=0 value=0
start=4 value=1
start=7 value=0
~~~

これは「Cycle 4から1」「Cycle 7から0」を意味します。

End / Durationは次のTransitionやDocument終端から計算されます。

## 8.2 Add new transition

主な入力:

- Start (cycle)
- Value
- Comment

操作:

- Add
- Add & Continue

## 8.3 Transitions一覧

Transitions表にはStart / End / Duration / Value / Comment等が表示されます。

利用できる操作:

- Add Row
- Duplicate
- Delete
- Delete Selected
- Move Up
- Move Down
- Import
- Export

複数行のCheckboxはTransitionのBulk操作用です。Canvas上のSignal選択とは別のSelectionです。

# 9. Binary Signal Generator

Binary SignalではBottom Signal内の **Generate Waveform** を使えます。

代表項目:

- Start
- Period
- Width / Duty
- Repeat Count / Infinite
- Initial
- Active
- Phase
- Suppressed periods

用途:

- 1回だけのPulse
- 周期Pulse
- 有限回繰り返し
- 継続Pulse
- 一部Periodだけ抑制

GenerateはSignalの値列を1回のSemantic操作として置換します。Undoで戻せます。

# 10. Bus Signal

BusではValueを数値/文字列表現として扱います。

主な表示形式:

- Hex
- Binary
- Decimal
- Signed
- Unsigned
- Symbolic / Enum

表示形式はWaveform、Bottom、Inspectorで同じFormatterを使う方針です。

Bus幅に対して不正な値はValidationで拒否されます。

# 11. State / Enum

State Signalは単なる表示文字列だけでなく、Document Propertiesの **State Enums** と組み合わせられます。

例:

~~~
0 -> IDLE
1 -> WAIT
2 -> EXEC
3 -> DONE
~~~

Enum定義はID / Name / Value / Labelを持ちます。

Source valueと表示Labelは分離されるため、内部値を維持しながら仕様書向けの状態名を表示できます。

# 12. Clock

ClockはClock Generatorを持つ専用Signalです。

主なGenerator項目:

- Start
- Period
- Duty
- Phase
- Initial
- Polarity
- Enable / Suppression関連設定

Clock Previewが使える場合、Apply前のDraftを一時的にCanvasへ表示できます。PreviewだけではCanonical/History/Dirtyは変更されません。

# 13. Clock Edge Counter

ClockごとにEdge番号をOverlay表示できます。

| 項目 | 内容 |
|---|---|
| Show | 表示ON/OFF |
| Mode | Rising / Falling / Both |
| Start Number | 開始番号 |
| Count From | Signal start / Selected edge / Marker / Visible range start |
| Marker | Count From=Marker時のBookmark |
| Every N | N edgeごとに表示 |
| Position | Above / Below |
| X/Y Offset | 表示位置微調整 |

Edge番号はWaveDromの実Edge Geometryへ配置されます。単純な cycle × pixel幅 では配置しません。

Gated / Suppressed Clockでは、実際に存在する対象Edgeだけがカウント対象です。

# 14. Group

GroupはSignalを仕様書上で整理するための表示単位です。

できること:

- Create / Rename / Delete
- Signal移動
- Group reorder
- Collapse / Expand
- Header
- Background band
- Border
- Spacing before / after

GroupはRoleやHardware hierarchyとは独立しています。

# 15. SpacerとVertical Layout

SpacerはSignalではなく、図の中に意図的な縦方向の空白を作るLayout objectです。

調整可能な要素:

- Global rowHeight
- Global signalSpacing
- Group spacingBefore / spacingAfter
- Signal spacingBefore / spacingAfter
- Spacer height

Signalの絶対Y座標を保存するのではなく、これらのLayout inputから表示位置を計算します。

# 16. Signal Label / Role Column

Role、Signal Name、Timing Canvasは別Columnです。

Signal Nameでは:

- Left / Center / Right alignment
- width
- Auto Fit
- Ellipsis / Wrap

等を設定できます。

# 17. SelectionとClipboard

HomeのEdit操作:

- Cut
- Copy
- Paste
- Delete
- Duplicate
- Select All
- Find & Replace

Keyboard:

| 操作 | Shortcut |
|---|---|
| Undo | Ctrl/Cmd + Z |
| Redo | Ctrl/Cmd + Shift + Z |
| Copy | Ctrl/Cmd + C |
| Cut | Ctrl/Cmd + X |
| Paste | Ctrl/Cmd + V |
| Duplicate | Ctrl/Cmd + D |
| Select All | Ctrl/Cmd + A |
| Delete | Delete |
| Cancel gesture/menu | Esc |

入力欄やIME入力中は、通常のText editingを邪魔しないようGlobal shortcutは抑制されます。

# 18. View / Zoom / Workspace

## 18.1 Show

表示ON/OFF:

- Signal Names
- Roles
- Group Background
- Annotations
- Transactions

## 18.2 Panels

- Inspector
- Bottom Editor
- Bottom Compact
- Bottom Expanded
- Signal Tree
- MiniMap
- Signal Split（Cycle Viewのみ）

## 18.3 Guides

- Grid
- Snap
- Ruler

## 18.4 Zoom

- Zoom Out / In
- 50%
- 100%
- 150%
- 200%
- 400%
- 800%
- Fit All
- Fit Selection

## 18.5 Workspace preset

- Edit
- Waveform Focus
- Review
- Transaction

**Focus Waveform** はSignal Tree / Inspector / Bottom等を整理し、波形閲覧に画面を広く使うためのモードです。

# 19. Signal Split

Signal SplitはCombined Viewとは別機能です。

~~~
Signal Split
= 同じCycle Signal一覧を上下2つのviewportで見る
~~~

特徴:

- 上下とも同じCanonical Signal順
- Vertical scrollは独立
- Horizontal time / Zoom / Rulerは共有
- SignalをUpper/Lowerへ振り分ける機能ではない
- View-only

上側にClock/Reset、下側にData/Responseを固定して見たい大規模チャートで有効です。

# 20. MiniMap

MiniMapはDocument全体のOverviewとViewport位置を確認するための表示です。

主な用途:

- 大量Signalの全体位置確認
- Viewport rectangle確認
- Click / Dragによる移動

MiniMapは必要な場合にViewからONにします。

# 21. Timeline Range

CanvasまたはRuler上で時間範囲を選択できます。

Rangeは半開区間 [start, end) として扱われます。

例:

~~~
[4, 8)
= Cycle 4,5,6,7
~~~

Reverse dragやShift extensionにも対応します。

# 22. Timeline編集

Timelineタブの主な操作:

## 22.1 Insert

- Add Cycle
- Add N
- Before
- After

## 22.2 Range Edit

- Delete
- Duplicate
- Move

Timeline編集では対象範囲だけではなく、後続のSemantic objectが共通のTimeline transformに従います。

影響対象例:

- Signal transitions
- Annotation anchors
- Bookmark
- Label Anchor
- Time Group
- Transaction

Undo / Redoは1回のTimeline操作単位です。

# 23. Bookmark

BookmarkはSource Cycle上の名前付き位置です。

TimelineタブからPrevious / Add / Next / Bookmarksを利用できます。

Bookmarks Bottom Panelでは作成・編集・削除・Navigationができます。

BookmarkはClock Edge CounterのCount From=Markerの参照先としても利用できます。

# 24. Label Anchor

Label Anchorは時間そのものを削除せず、**Ruler表示番号だけを途中から変更**する機能です。

例:

~~~
Source:   98 99 100 101 102
Display:  98 99   0   1   2
                  ^
             Label Anchor
~~~

Timeline → Label Anchor → Add で作成します。

Source CycleはCanonicalのままで、見かけのRuler labelだけをリベースします。

# 25. Time Group / Axis Break

Time Groupは時間範囲を意味付きでまとめる機能です。

Timeline → Outline:

- Group
- Break
- Expand
- Collapse / Expand
- Ungroup

**Axis Break** は選択範囲を折りたたみ、仕様書上で長い待ち時間などを圧縮して表示する用途です。

折りたたんでもSource Timeは維持されます。

# 26. Cursor A / B

ViewタブからCursor A / Bを設定できます。

操作:

- Set A
- Set B
- Swap
- Clear

表示例:

~~~
A = Cycle 12
B = Cycle 19
Δ = 7 cycles
~~~

Document PropertiesでPhysical Timebaseを設定している場合は、ΔTimeも表示できます。

CursorはView-onlyです。

# 27. Physical Timebase

Document Properties → Physical Timeで設定します。

- Base frequency (Hz)
- Display unit: s / ms / us / ns / ps / fs

設定すると、Cycle差だけでなくPhysical time差をCursorやMeasurementで表示できます。

Canonical Source Cycleが時間軸の基準であることは変わりません。

# 28. Annotation

AnnotationはWaveform上のOverlay objectです。

主なType:

- Text
- Callout
- Vertical Line
- Range
- Bracket
- Highlight
- Marker
- Measurement
- Arrow
- Dependency
- Timing Region
- Ghost Trace
- Rectangle
- Ellipse
- Connector
- Text Box

## 28.1 基本作成

1. SignalまたはRangeを選択
2. Annotationタブ
3. Typeを選択
4. Add annotation

Arrow / Dependency / Measurementでは **Pick ... endpoints** を使い、実際のTransition/Edgeを2点選択できます。

## 28.2 Anchor

Anchorは単なるX/Yではなく、次のようなSemantic pointへ結び付きます。

- Cycle start / center / end
- Signal transition
- Rising edge
- Falling edge
- Bus transition
- Marker
- Other annotation

Zoom / Scrollしても意味位置は維持されます。

## 28.3 Offset

Semantic Anchorとは別に、LabelやObjectへPixel offsetを加えられます。

「意味位置」と「見た目の微調整」を分離するためです。

# 29. Arrow / Dependency

Arrow系ではStraight / Orthogonal / Curve / Diagonal等のRouteを使えます。

Arrow direction:

- None
- Start
- End
- Both / Bidirectional

From / ToはSemantic endpointとして保持され、Label offsetはEndpointとは独立して調整できます。

# 30. Measurement

Measurementは2点間のTiming差を意味付きで表します。

~~~
VALID ↑ -> READY ↑
ΔCycle = 2
ΔTime  = 10 ns
~~~

Threshold profile:

- Cycle anchors
- 50%
- 30 / 70%
- Custom

Transition threshold / ratioによるMeasurementも可能です。

Measurementは保存されるSemantic Annotationです。
一時的な比較だけならCursor A/Bを使います。

# 31. Timing Region / Ghost Trace

## Timing Region

特定時間範囲をOverlayで示します。

## Ghost Trace

既存SignalをSourceとして、比較用のDashed traceをOffset表示します。

Timing比較やExpected pathの提示などに利用できます。

# 32. Legend

LegendはDocument Propertiesで設定できます。

- Show
- Orientation
- Used Roles Only
- Entry label
- Entry visibility
- Entry order
- X / Y
- Free position / canvas-corner anchor mode

LegendはCanvas上のOverlayとして選択・移動できます。

Exportにも反映されます。

# 33. Document Header / Footer

Document Propertiesから仕様書向け情報を設定できます。

Header:

- Subtitle
- Description
- Notes
- Preconditions
- Constraints
- Exceptions

Footer:

- Figure Number
- Revision
- Text

長文はWaveformの幅とは独立したDocument layoutとして扱います。

# 34. Transaction

Transactionは複数Signalにまたがる処理を意味のある1単位として表します。

主な属性:

- Name
- Start / End
- Lane
- Group
- Phases
- Linked Signals
- Description / Color等

Transaction ViewまたはCombined Viewで確認しやすくなります。

## 34.1 Create / Duplicate

HomeのTransaction groupからCreate / Duplicateを使えます。

選択Rangeを初期Start/EndとしてTransactionを作成できます。

## 34.2 Lane

同じLaneを持つTransactionは、同じ意味上のTrackへ配置されます。

## 34.3 Group

Transaction用Groupも作成できます。

- Add
- Ungroup

Signal Groupとは別のDomainです。

# 35. Transaction Phase

1つのTransactionは複数Phaseへ分割できます。

~~~
AXI Write
[ AW ][ W ][ B ]
~~~

各PhaseはStart / Endを持ち、Main Transaction bar上にも意味のある幅として表示されます。

Phase編集はTransactionの詳細編集としてBottomから行います。

# 36. Linked Signals

Transactionは関連するSignalをStable IDでLinkできます。

用途:

- Transaction選択時に関連Signalを強調
- Reveal linked signal
- Focus linked signals
- SignalとTransactionの対応確認

Linked Signalsは単なる文字リストではなく、Canonical Signalとの参照です。

# 37. Transaction Time Scale

Transaction View / Combined Viewでは、Transaction側のTime Scale表示を調整できます。

表示単位を変更してもCanonical Source Cycleは変わりません。

Cycle waveformとTransactionは共通のSource Time Mappingを持ちます。

# 38. Scenario

1つのTiming Document内に複数Scenarioを持てます。

例:

- Normal transfer
- Back pressure
- Reset
- Timeout
- Consecutive transfer

操作:

- Add
- Switch
- Duplicate
- Rename
- Delete

ScenarioごとにTiming状態を持ちながら、共有Signal identity等の方針を維持します。

# 39. Scenario Comparison

Scenario A / Bを比較し、差分を確認できます。

表示できる内容:

- 変化したSignal
- 変化したTime range
- Difference overlay
- Show in timeline / Reveal

比較自体はDocumentの元データを破壊する操作ではありません。

# 40. Problems

ProblemsはSchema errorだけでなく、Timing/Protocol診断を表示する共通面です。

例:

- Invalid value
- Missing reference
- Timing constraint violation
- Protocol check
- Import failure
- Export failure

Problemを選ぶと、可能な場合は該当Signal / Range / EntityへRevealします。

# 41. Review / Timing Checks

ReviewタブではTiming diagnosticsを確認できます。

機能例:

- Check refresh
- Problem navigation
- Timing/Protocol category ON/OFF
- Latency constraint作成

ConstraintはSignal edge間の許容Cycle範囲などを意味付きで定義します。

# 42. Advanced JSON

Bottom → JSONではCanonical dataを確認できます。

通常:

- Read Only
- Format
- Validate
- Copy
- Selected Object / Whole Document

Advanced Editableを有効にした場合は直接編集できますが、Apply時にSchema/Canonical validationを通ります。

JSON編集が失敗した場合、現在のCanonical文書を部分的に壊すのではなく、変更を拒否してProblemを表示します。

通常の作図はGUIを使うことを推奨します。

# 43. AI Assistant

AIタブの **Ask / Edit** からBottomのAI Assistantを開きます。

基本フロー:

~~~
Context
-> Proposal
-> Preview
-> Validate
-> Apply / Cancel
~~~

AI proposalは直接JSONを書き換えるのではなく、可能な限りTyped Semantic Commandへ変換されます。

Apply前のPreviewではCanonical/Historyを変更しません。

Stale revisionのProposalは拒否されます。

## 43.1 Built-in / Offline

ローカルで利用できる代表例:

- Signal rename / show / hide
- Handshake missing-case suggestion
- Protocol checks

## 43.2 Connected AI

外部Claude/Codex等を接続している環境では、より広い提案・Reviewを行えます。

Provider statusはAI Ribbonに表示されます。

## 43.3 現在サポート外

UIが明示的に not supported とする変換は実行されません。

例:

- Waveform → SVA の自動変換
- Generic waveform → scenario の無制限変換

# 44. Export

Export Dialogでは次を指定できます。

## Format

- SVG
- PNG
- PDF

## Scope

- Entire Document
- Selected Range

## Page

- A4
- Letter
- Wide
- Landscape / Portrait
- Fit Width / Fit Page
- Margin

## Fold Policy

- Respect Axis Break
- Expand Folded Ranges

## PNG

- 1x
- 2x
- 3x

## Clipboard

- Copy SVG
- Copy PNG

Exportは画面Screenshotではなく、Canonical dataから構築したExport Sceneを使います。
そのため、EditorのScroll位置や未表示行に依存せずDocument全体を出力できます。

# 45. Undo / Redo / Dirty

Semanticな編集はHistoryへ記録されます。

例:

- Signal value変更
- Rename
- Group移動
- Timeline Insert/Delete/Move
- Annotation編集
- Transaction編集
- Document Properties

一方、次のような操作は通常View-onlyです。

- Selection
- Scroll
- Zoom
- Grid/Snap/Ruler ON/OFF
- Cursor A/B
- Panel open/close
- MiniMap navigation
- Signal Pin

View-only操作だけではDocumentをModifiedにしません。

# 46. Pinの2種類

## 46.1 Signal Pin

長いSignal一覧で、Clock/Reset等のSignal rowを上部へ固定表示します。

- Stable Signal IDで保持
- Workspace-only
- Save/Open対象外
- Canonical row orderは変更しない

## 46.2 Bottom Pin / Follow Selection

Bottom Editorの編集対象を固定します。

例えばSignal AをBottomに固定したまま、CanvasではSignal Bを選択して比較できます。

Signal Pinとは独立です。

# 47. Hierarchy / Full Path

Signalは任意でHardware source情報を持てます。

例:

~~~
top.u_soc.u_dma.u_axi.arvalid
~~~

表示モード:

- Signal only
- Relative path
- Full path
- Split columns

GroupとHardware hierarchyは別物です。

Hierarchy ViewやRevealを利用できるDocumentでは、同じCanonical SignalをGroup/Hierarchyの両方向から確認できます。

RTL/SystemVerilogファイルからHierarchyを直接Importするワークフローは、現行リリースの通常機能には含まれません。

# 48. 現在の非対応・将来機能

次はRoadmapとして検討されていますが、現行User Manualの通常操作対象ではありません。

- VCD / FST simulation waveform import & specification compare
- RTL/SystemVerilog hierarchy import
- Setup/Hold/Valid/Don't-care等を独立Canonical typeとして体系化したSemantic Annotation taxonomy
- 無制限なAI自動変換機能

# 49. よくある困りごと

## 波形が見えない

- SignalのVisibleを確認
- Viewの表示設定を確認
- Fit Allを実行
- GroupがCollapseされていないか確認

## 値を変えたのに想定と違う

Event Tableでは各Cycle値ではなく**変化点**を編集します。
前のTransitionの値は次のTransitionまで継続します。

## AnnotationがEdgeからずれる

SnapをONにし、Semantic endpoint pickingを使用してください。
Pixel位置を直接合わせるより、Transition / Rising / Falling edgeへAnchorしてからOffsetで微調整します。

## 長い待ち時間を短く見せたい

TimelineのTime Group / Axis Breakを使います。
Source Timeそのものを削除せず、表示だけ圧縮できます。

## 2つの遠いSignalを同時に見たい

Cycle Viewで **Signal Split** を使います。
上下は同じSignal一覧ですがVertical scrollを独立させられます。

## TransactionとSignalを同時に見たい

**Combined View** を使います。

## Canvasが狭い

View → **Focus Waveform**、Inspector/Bottom/Signal Treeの表示切替、Bottom Compactを利用します。

# 50. 基本的なおすすめ作業フロー

~~~
New / Open
-> Group / Signalを作成
-> Event / Clockを入力
-> Role / Label / Layoutを整理
-> Timeline Rangeを調整
-> Bookmark / Measurement / Annotationを追加
-> 必要ならTransaction / Scenarioを作成
-> Review / Problemsを確認
-> Save
-> SVG / PNG / PDF Export
~~~

最初はCycle View + Signal Event Tableだけでも十分にTiming Chartを作れます。
必要になった機能だけ、Measurement、Transaction、Scenario、AIへ段階的に広げるのがおすすめです。
