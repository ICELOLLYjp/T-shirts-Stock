# ICELOLLY T-shirts Stock — Project Handoff

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
