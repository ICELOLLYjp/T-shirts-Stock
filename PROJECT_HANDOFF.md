# ICELOLLY T-shirts Stock — Project Handoff

## 2026年10月8日 共通メーカー対応を各アプリへ接続する工程

利用者が4工程を承認：作成済み共通参照の各アプリ反映、在庫管理の一括確認・編集、EC商品登録の対応補完、メーカー在庫取得と欠品時納期の接続。この順で作業ブランチの実装を進める。各mainと公開環境は変更していない。

在庫管理のColor設定に一括確認・編集を追加。現在の管理名と固定IDを並べ、確認済みメーカー資料の品番と正式カラーを選ぶ。選択した行のプレビュー後、1回のFirestoreトランザクションでmanufacturer_color_linksとpurchase_item_mappingsだけを保存する。最新マスター、対応と仕入れ索引が表示時と変わっていれば停止する。数量だけの変化はこの確認を妨げない。既存の管理名、販売名、標準Body、inventory_v2、SKU、注文を更新しない。同じBodyの品番混在と逆引きの競合は停止。対応版、変更前後、操作ID、JST確認日を履歴に保持し、同じ内容の保存は変更なし。応答不明では入力を保持して読み直す。実Firestoreでの一括編集は未実施。

Sales Managerは現在在庫一覧に正式カラー名、色コード、品番を併記し、検索対象に加える。現在の短い名称と数量を保持する。過去売上、Session、POSの当時の名称は変更しない。未使用Colorに数量やVariantを生成しない。

ECプラグイン0.47.0のコードを作成。API応答から限定したmanufacturerColorとmanufacturerColorsだけを投影し、履歴をブラウザーへ送らない。メーカー共通画面は内部BodyとColorの完全一致から品番と正式色、確認済みサイズを候補選択する。選択だけでは保存しない。共有元との不一致はメーカー品番、観測、受注方針の保存を停止して再確認する。商品編集に同じ対応とメーカー観測を表示し、品番と登録済みサイズ表が一意ならサイズ表候補を選ぶ。文章、写真、価格、属性、寸法は確認操作なしで上書きしない。

メーカー在庫取得はまずコピペによる確認入力を実装。品番と全サイズ見出し、正式カラーコード、在庫行を厳格に解析し、列不足、重複、不明な数値は停止。数量0と製造対象外を分ける。元の画面を今確認したというチェックと解析結果確認後、選択中の色・サイズのメーカー在庫状態だけを入力する。メーカー数量や貼り付け原文を永続保存しない。入荷予定は自動解釈しない。手動確認と有効期限を共有保存し、商品ごとの欠品時納期は既存CMSで別途確認保存する。メーカー入荷日を発送日とみなさず、購入受付は未開始。

自動取得、スクリーンショット解析、コピペの複数サイズ一括保存は未実装。認証済みメーカー在庫画面の接続方式を確認し、取得元、取得日時、有効期限、品番と正式カラーとサイズの契約を定めてから追加する。公開ページの写真や以前のコピーを最新在庫と扱わない。

ローカルNodeテスト118項目成功。PHP境界とブラウザー操作はGitHub CIで確認する。実機、実WordPress0.47.0の導入は未確認。13色の実メタデータ登録は完了済み、Japan Blackはcolor_15gcow。新しい完成品セルはないため在庫0と扱わない。最新導入済みAPIは0.37.1、最新の旧配布ZIPは0.46.0。0.47.0のZIPと読取API更新物を別々に用意する。プラグイン更新だけではAPIの共通対応は有効にならない。

次の確認：CI成功後の配布ZIPと読取API更新、各アプリ作業ブランチの公開反映方針、iPhoneでの一括編集と候補補完、実データで変更なし保存とメーカー照合。自動取得の接続確認はその後。商品ページ、カート、購入ページ、注文処理、国別販売価格と決済はCMS確認後の工程として維持する。


## 2026年10月8日 13色の実登録完了と共通参照の実装

利用者からCloud Shellの適用結果を受領：status=applied、confirmedColors=13、createdJapanBlack=true、metadataRevision=1、inventoryQuantityChanged=false。これはメタデータ登録の成功であり、各アプリの新しい表示コードの公開成功ではない。Japan Blackの新規固定IDはcolor_15gcow、MIJのbody_2um63vに対応し、メーカーJPC-001の02ブラックを参照する。完成品セルと商品バリエーションは自動作成しない。

同じ参照モジュールをTシャツ在庫管理、Sales Manager、EC読取APIへ追加する変更を作成。既に読み込んだmasterのmanufacturer_color_linksのみを参照し、名前やSKUから推測しない。固定ID、schemaVersion、revision、レコード版、確認日と項目を検証し、欠落と不一致は未確認とする。出力は正式カラーの公開参照項目に限定し、履歴や任意の私的項目は含めない。

在庫管理のColor設定は現在の管理名と販売名を保持し、品番・正式名・コードを読み取り専用で併記。Sales Managerの現在在庫行、Master options、新規Variant draftは元の名称・ID・数量を保持し、manufacturerColorまたはmanufacturerColorsを補助データとして付加する。POSと履歴の画面表示変更は含めない。EC APIは各行のmanufacturerColorと全体のmanufacturerColorsを返し、在庫セルのないJapan BlackやLight Purpleの対応も全体の参照に含められる。新しい在庫行は生成しない。v2の旧SKU照合と参考価格は維持。Firestore GETマスクに共通メタデータのschemaVersion・revision・itemsだけを追加し、履歴は取得対象に含めない。

ローカル検証はAPIと既存在庫、bulk、REST、runtime、共通参照87項目と、Tシャツ表示・Sales Manager参照5項目が成功。各コピーは同一ソース。実ブラウザーとiPhoneでの表示確認は未実施。各アプリのmainは変更しない。TシャツとSales Managerは専用作業ブランチとDraft PRへ、Websiteは既存Draft PR #3へ保存する。staging APIはまだ0.37.1、WordPressプラグインは0.46.0のまま。APIの新機能は更新後に有効となる。WordPressのメーカー共通画面との自動対応連携は次工程。


Last updated: 2026-10-01

## Start here — mandatory workflow for a new chat

Before proposing or changing code:

1. Connect to GitHub and open `ICELOLLYjp/T-shirts-Stock`.
2. Fetch the latest `main` branch. Do **not** rely on an old chat, local copy, or previously cached file.
3. Read this `PROJECT_HANDOFF.md` from the latest `main`.
4. Read the latest `index.html` from the latest `main` before editing it.
5. If the task touches event sales, POS, SKU sales, inventory return/reconciliation, or Sales Manager synchronization, also fetch the latest `main` and `PROJECT_HANDOFF.md` in `ICELOLLYjp/Sales-Manager` before changing either repository.
6. Check recent merged PRs relevant to the requested area when behavior is unclear.
7. Preserve existing data structures and inventory semantics unless the user explicitly asks for a schema/behavior change.
8. Prefer the least expensive runtime path: reuse already-loaded `tshirtStock/master` data and avoid extra Firestore reads/listeners when the same result can be computed in memory.
9. For code changes, use a branch/PR, validate syntax and the relevant data paths, then merge only after the diff is understood.

This file is the persistent handoff source. If this file conflicts with current code, **current `main` is authoritative** and this file should be updated in the same change.

---

## 1. Product purpose

This is first and foremost a **T-shirt inventory management app** for ICELOLLY.

The UI must not drift into looking primarily like a task manager, order manager, or generic ERP. The first job is to make current finished T-shirt stock easy to see and update on an iPhone.

Design principles:

- Inventory is the main screen and main mental model.
- One glance should show what exists now.
- Production tasks may be overlaid on inventory, but should not replace inventory as the primary number.
- Keep the UI simple, compact, and fast on iPhone.
- Neutral gray surfaces + blue highlight/accent. Avoid pink as a primary UI color.
- Avoid adding visual complexity unless it improves stock decisions.

Live app:
- `https://icelollyjp.github.io/T-shirts-Stock/`

Repository:
- `ICELOLLYjp/T-shirts-Stock`

Main application file:
- `index.html`

---

## 2. Current information architecture

Top-level categories:

- **在庫** — primary category
  - 完成品
  - 未プリント
  - シート
- **制作**
  - 制作タスク
- **受発注**
  - Customer Orders
- **管理**
  - 原価
  - Design設定
  - Body設定
  - Color設定

The app opens to **完成品 → 在庫一覧・チェック** by default.

Recent UI reorganization was introduced in merged PR #7.

---

## 3. Finished inventory behavior

### Source of truth

When `inventoryAuthority === 'master'`, finished inventory is stored in:

- Firestore: `tshirtStock/master`
- top-level field: `inventory_v2`

Structure is Body → Design → Color → Size → inventory cell.

`tshirtStock/shared` is maintained as a compatibility/shared aggregate derived from the master inventory. Do not casually reverse this relationship.

### Direct entry

The inventory list allows direct numeric entry for Body / Design / Color / Size cells.

Direct numeric entry:

- changes finished-goods stock only;
- is treated as a manual stocktake/inventory adjustment;
- does **not** consume blank T-shirts;
- does **not** consume print sheets;
- is serialized before saving the full `inventory_v2` map to reduce write collisions;
- then syncs the aggregate to `tshirtStock/shared`.

Design subtotal rows are read-only.

This behavior was introduced in merged PR #8.

---

## 4. Inventory update time and source

The inventory list shows the latest update time and update source for each Body × Design × Color combination.

Known source labels include:

- `direct_input` → 直接入力
- `sales_manager` → Sales Manager同期
- `inventory_adjustment` → 在庫調整
- `production` → 制作反映
- `outsourced_stock` → 外注入庫
- `body_assignment` → Body振分

Metadata is derived from already-loaded `tshirtStock/master` data using:

- `inventory_color_meta`
- and, when needed, cell-level `updatedAt` / `updateSource` in `inventory_v2`

Do not implement this as one Firestore read per color. The current design intentionally avoids that performance cost.

This was introduced in merged PR #9.

### Sales Manager side

`ICELOLLYjp/Sales-Manager` also writes inventory update metadata with `updateSource: 'sales_manager'` on its main T-shirt inventory mutation paths, including SKU sales, reversals, later Quick→SKU assignment, and physical inventory application. This was merged in Sales Manager PR #107.

If changing this contract, inspect **both repositories first**.

---

## 5. Production tasks overlaid on inventory

The completed-stock inventory list also shows production tasks in the same Size grid so the user can manage stock similarly to the old handwritten stock sheet.

Current display semantics:

- the large/input number = **current finished inventory**;
- blue `＋N` = **production task for stock** (`purpose: stock`);
- `注N` = **production task for a customer order** (`purpose: order`);
- a Body / Design / Color combination remains visible when finished stock is 0 if it has a production task;
- Design-level Size subtotals also include the task overlay;
- the overlay is display-only and does not mutate inventory.

Inventory review batch-task registration:

- checked Body / Design / Color rows in the finished inventory list can be sent to a batch production-task editor;
- Size quantities are entered explicitly per checked row to avoid guessing production quantities;
- production method and purpose are shared for the batch;
- all selected task additions are merged in memory and saved with one `production_tasks` write;
- successful registration clears the review checks and rerenders the existing in-memory task overlay.

Material context in the finished inventory list:

- each Design subtotal shows current print-sheet stock;
- each Body / Color row shows the total blank Body stock with an optional Size breakdown;
- the batch production-task editor shows current print-sheet stock, blank Body total, and Size-level blank Body availability;
- all values are calculated from the already-loaded `masterDocument.blank_stock`, `print_sheets`, and `sheet_settings`; no additional Firestore read or listener is used.

Performance requirement:

- Do not add Firestore reads for this overlay.
- Build it in memory from the already-loaded `masterDocument.production_tasks`.
- Current implementation aggregates tasks once per inventory-list render.

This was introduced in merged PR #10.

---

## 6. Production-task semantics

Production tasks are stored in `masterDocument.production_tasks`.

Important dimensions:

- `designId`
- `bodyId`
- `colorId`
- `sizeId`
- `qty`
- `method`: `inhouse` or `outsourced`
- `purpose`: `stock` or `order`

Task screen presentation:

- the task screen separates current tasks into an in-house list and an outsourced list;
- each list shows its task count and total quantity;
- changing a task method moves it to the corresponding list on rerender;
- this is presentation only and does not change `production_tasks` storage or completion semantics.

When completing an in-house stock-production task:

- blank Body stock decreases;
- required print sheet stock decreases;
- finished stock increases;
- update source is recorded as production.

When the task purpose is `order`:

- completing the task does not add the item to finished-goods inventory, because it is treated as direct delivery to the order.

Do not merge these semantics with direct inventory entry.

---

## 7. Other managed areas

### Design master registration

New Designs are registered from **管理 → Design設定**.

Registration behavior:

* writes the new Design to `tshirtStock/master.masters.designs` with a stable Design ID;
* also refreshes the compatibility `tshirtStock/shared.designs` catalog entry;
* sets no finished inventory, blank Body stock, sheet stock, SKU, production task, order, or cost by itself;
* the Design becomes available to inventory, sheet, task, and cost selectors that already read the Design master.


Design regular-combination management:

* the old `定番のBody・Colorを編集` control is managed from **管理 → Design設定**;
* select a Design there, then add Body × Color combinations to the Design's regular display set or remove them from that set;
* removing a combination from the regular set changes only `display_preferences`; it does not delete finished inventory, SKU identity, production tasks, blank stock, sheet stock, orders, or cost data;
* combinations that still exist in inventory or production tasks remain recoverable as `定番に戻す` candidates.

### Blank/unprinted T-shirts

Fields include:

- `blank_stock`
- `blank_orders`

These represent material stock and ordering separately from finished inventory.

### Print sheets

Fields include:

- `print_sheets`
- `sheet_orders`
- `sheet_settings`

Support main sheets and optional sub sheets.

### Customer Orders

Stored under:

- `customer_orders`

Orders can include customer/contact details, Body/Design/Color/Size/quantity, due date, source, notes, status, and delivery/recipient-address data.

Orders are not the primary app screen. Keep them under 受発注.

### Cost management

The app also manages Body cost, sheet cost, screen-plate events, outsourced cost, and SKU-specific cost data. Cost changes may feed Sales Manager compatibility caches. Avoid changing cost behavior when working only on inventory UI.

---

## 8. UI priorities

When making UI decisions, use this order of importance:

1. Current finished inventory quantity is immediately visible.
2. It is obvious which Design / Body / Color / Size the number belongs to.
3. Direct stock correction is fast on iPhone.
4. Production tasks can be seen alongside stock without obscuring the stock number.
5. Update source/time can be checked without dominating the row.
6. Secondary administration functions stay out of the way.

Current styling direction:

- background: neutral/light gray;
- cards/surfaces: white or neutral;
- highlight/accent: blue;
- avoid a pink-primary theme;
- compact but touchable controls for iPhone.

---

## 9. Performance guardrails

The user explicitly prefers the implementation that does **not** reduce responsiveness.

Therefore:

- reuse `masterDocument` already in memory;
- aggregate task/update metadata in memory;
- do not add N+1 Firestore reads for rows/colors/SKUs;
- do not add new real-time listeners unless necessary;
- avoid rerendering the entire app for a small UI-only change if a local update is sufficient;
- keep direct inventory writes serialized where the full `inventory_v2` map is written;
- on iPhone, prioritize fast event-time interaction over decorative animation.

When proposing two implementations, choose the lower-runtime-overhead one unless it creates correctness risk.

---

## 10. Recent merged PRs to know

### T-shirts-Stock

- **#7** — stock-first navigation; categories 在庫 / 制作 / 受発注 / 管理; gray + blue visual direction.
- **#8** — inventory list first; direct numeric finished-stock input.
- **#9** — per-color inventory update time and update source.
- **#10** — production-task overlay on inventory list without additional Firestore reads.

At the time this handoff was written, `main` includes PR #10.

### Sales-Manager

- **#107** — writes `sales_manager` update-source metadata on T-shirt inventory mutations.

Always re-check current `main`; PR numbers above are historical context, not a substitute for reading the code.

---

## 11. Known future direction / open ideas

These are ideas discussed with the user, not all implemented requirements:

- Inventory history/audit trail: the user wants a simple history of when/why stock changed.
- History should not slow the default inventory screen; prefer loading detailed history only when the user opens it.
- Continue tuning the production-task overlay based on real iPhone usage, especially badge size, placement, and density.
- Keep the app recognizably an inventory manager even as Orders, purchasing, costs, and tasks grow.

Do not assume an open idea is approved for implementation unless the current user request asks for it.

---

## 12. Validation checklist before merge

For inventory/UI changes, check at minimum:

- latest `main` was fetched before editing;
- `PROJECT_HANDOFF.md` was read;
- module JavaScript syntax is valid;
- `tshirtStock/master` and `inventory_v2` paths are unchanged unless intentionally changing schema;
- direct entry semantics are preserved;
- production-task semantics are preserved;
- no accidental extra Firestore reads/listeners were introduced for list rendering;
- iPhone layout remains usable;
- only intended files/sections changed;
- PR description states whether data behavior changed or UI only.

If the change affects Sales Manager sync, validate the corresponding Sales Manager paths as well.

---

## Copy/paste new-chat command

Use the following message at the start of a new ChatGPT chat:

> ICELOLLY T-shirts Stockの開発を引き継いでください。GitHubの `ICELOLLYjp/T-shirts-Stock` に接続し、最初に最新の `main` と、`index.html` と同じ階層にある `PROJECT_HANDOFF.md` を読んでください。過去チャットの記憶よりGitHubの最新 `main` を優先してください。Sales Manager連携に関係する作業なら `ICELOLLYjp/Sales-Manager` の最新 `main` と `PROJECT_HANDOFF.md` も確認してください。確認が終わったら、現在の実装状態と今回の作業に関係する注意点を短く整理してから作業を開始してください。処理速度を落とさない実装を優先し、既存の在庫データ構造・SKU・Orders・原価・制作タスクに意図しない変更を入れないでください。
---

## 13. System role boundary with Website, Accessories and Sales Manager

Recorded: 2026-10-05

This app must remain the primary T shirt inventory and production operations app.

### 13.1 What T shirts Stock owns

T shirts Stock is the operational authority for:

* Finished T shirt inventory in `tshirtStock/master.inventory_v2`
* Body, Design, Color and Size inventory dimensions
* Blank Body stock
* Print sheet stock
* Production tasks and production completion effects
* Current inventory review and direct physical stock corrections
* T shirt production context needed for customer orders
* Inventory related master data already maintained by this app

The default UI must continue to make current inventory the primary mental model.

### 13.2 What T shirts Stock does not own

T shirts Stock is not:

* The public ecommerce storefront
* The public product portfolio
* The event POS or event sales ledger
* The customer facing translation, photography or merchandising system
* The authority for WooCommerce order state

Do not move those responsibilities into this app merely because T shirt data is available here.

### 13.3 Relationship with Sales Manager

Sales Manager is the event sales and event business operations app.

It may:

* Read T shirt catalog and stock information
* Record event sales and Sessions
* Apply defined exact SKU sale, void and approved reconciliation effects to canonical T shirt stock
* Store sale time snapshots needed for sales history and profitability

It must not maintain a second permanent T shirt stock authority.

### 13.4 Relationship with the ICELOLLY website

The website and WooCommerce are the customer facing ecommerce and portfolio layer.

The website may consume mapped T shirt information such as Body, Design, Color, Size, SKU and available stock. It owns web product images, descriptions, translations, merchandising, checkout and online order presentation.

WooCommerce must not become an independent canonical physical stock source. A future website integration should read stock from this app by default and apply paid online sale stock effects through a controlled, idempotent integration.

Do not write directly from a public website request into the full `inventory_v2` map without a reviewed transaction boundary.

### 13.5 Cross app rules

1. `tshirtStock/master.inventory_v2` remains canonical finished T shirt stock.
2. Preserve stable Body, Design, Color, Size and SKU identities.
3. Prefer read only catalog and inventory APIs as the first integration step.
4. Any external stock mutation must be explicit, idempotent and auditable.
5. Do not duplicate customer facing product copy or images here unless they are operationally required.
6. Online prices and event prices may differ. Do not make this app the implicit authority for every sales channel price.
7. Before changing a shared contract, inspect the latest Website policy and Sales Manager handoff in addition to this file.


## 共通カラー参照の検証記録 2026年10月8日

実登録の報告：13色、Japan Black新規追加、共通メタデータ版1、数量変更なし。Tシャツ在庫管理はDraft PR #26、機能ソース1e6736956f45fcf249504cced916b9bb063d741a、CI 37735164575が成功。Sales ManagerはDraft PR #115、機能ソースf3a009bb53b27d023f354084db024b7983337699、CI 37735166632が成功。WebsiteはDraft PR #3、機能ソース2855520ac900540485b3d05ae58766e346f2db77、CI 37735164243の全工程が成功。

同一参照モジュールのSHA256はb171aeaddb6375840b6612878a5ff50a785572766b54b71fbc08e66d5001b015。既存APIの認証・数量0と未知・SKU照合・参考価格・CMSブラウザー回帰も成功。TシャツとSales Managerの実ブラウザー表示は未確認。各mainと公開アプリは変更していない。WordPress ZIPは0.46.0、staging読取APIは0.37.1で今回の新しい参照コードはまだ未デプロイ。次は各アプリの公開方針に沿った反映と実機確認、WordPressメーカー画面への共通対応参照を接続する。既存WooCommerce属性を無断で改名しない。
