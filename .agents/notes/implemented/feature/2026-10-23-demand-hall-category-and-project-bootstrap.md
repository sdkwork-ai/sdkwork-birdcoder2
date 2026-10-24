# Agent Note: Demand hall category tree, application-form publish decision, and demand-to-project bootstrap

Status: implemented

English | [中文](2026-10-23-demand-hall-category-and-project-bootstrap.zh.md)

## Problem

The demand hall could not answer three questions its own screens asked. Publishing took a free-text category, so the same category was spelled differently by every publisher, nothing could be filtered reliably, and a category could not be governed. Nothing recorded which form of application a demand commissions, so a provider bid without knowing whether the delivery is a PC app, an H5 app, a mini program, or something else — while the workspace already carried a full SDKWork application-architecture inventory. A fresh deployment started with an empty hall: no explanation of the claim flow, and no open demands to practise it on.

The last gap was the most expensive: after claiming, the provider still had to leave the hall, create a workspace and session by hand, and copy the demand text over. The demand and the project it produces had no shared identity.

## Decision

The company domain owns the classification vocabulary, and the client renders it:

- `company_demand_category` is a tenant-scoped tree (`parent_id`, `category_code`, `display_name`, `display_name_en`, `description`, `app_form`, `level`, `path`, `sort_order`, `status`). Codes are lower-case slugs and immutable; the service enforces a four-level depth cap. `app_form` on a node is the default application form the publish form offers when that node is picked.
- `company_demand` gained `category_id`, `category_path`, and `app_form`. The service resolves the display name and path from the category row rather than trusting publisher text, requires a **leaf** category, and requires `appForm` for a `development` demand. A renamed or re-parented category re-projects `category`/`category_path` onto every demand under it, so a row never carries a stale label.
- Application forms are the SDKWork application-architecture standards, one code each: `pc`, `h5`, `static-web`, `miniprogram`, `flutter`, `uniapp`, `android-native`, `ios-native`, `harmony-native`, `unity`. The company service, the OpenAPI authority, the storefront, and the admin console all read that closed set from one place per surface.
- `GET /app/v3/api/company/demand_categories` serves the tree to the publish form (permission `company.demand_categories.read`). `GET/POST/PATCH/DELETE /backend/v3/api/company/demand_categories` is the operator contract (permission `company.demand_categories.manage`); delete is refused while a node has children or demands.
- Initialization data ships as seeds: the category tree, one guided onboarding demand (“第一次接单：从抢单到交付”) that walks claim → award → delivery → create-project, and three example demands across PC, mini program, and static web. Bid deadlines are relative (`now() + interval`), so a seeded hall is never already expired.
- The App Store PC publish modal renders the tree as a cascading menu (one column per level, branches drill down, only a leaf selects) and an application-form chip picker that prefills from the picked category. The demand card and detail render the category and application form.
- The `/admin` console gains a `demands` capability module (`sdkwork-appstore-pc-admin-demands`) that governs the tree through a `demands` port in `pc-admin-core`. That port reaches the company backend SDK through `createAppstorePcAdminCompanyBackendClient`; the demand domain stays owned by the company backend API, and the App Store console keeps its own backend client.
- BirdCoder's demand-hall plugin hosts the demand-to-project action: the embedded storefront renders the detail button, the host creates the project. The port picks a parent directory, creates a title-derived project directory (numeric suffix on collision), registers and renames the Workspace, connects its blank session, opens it, and sends the demand brief as the first prompt. The brief carries the demand id, title, category, budget, deadline, description, the application form, and the SDKWork specification that governs it. A started project closes the demand-hall overlay, because the new session would otherwise open behind it. Progress and failure render as one status line above the catalog.

## Alternatives considered

- **Keep the category as free text and group by string.** Rejected: filtering, badges, and the cascading menu all need stable ids and a path; string grouping also cannot gate a leaf selection or survive a rename.
- **Ship the taxonomy as a client-side constant.** Rejected: operators could not add or retire a category, the seed data and publish validation would disagree with the client, and two surfaces (storefront and BirdCoder) would each need their own copy.
- **Make the application form optional and infer it later.** Rejected: the form decides what a provider commits to and which specification governs delivery; deferring it moves a publish-time decision into a bid conversation.
- **Store the application form on the category only.** Rejected: two demands filed under “Web 应用” may be a static site and a PC system; the category default is a convenience, not the decision.
- **Create the project by prompting an existing session.** Rejected: the project needs its own directory and workspace before the first turn, and reusing the New Session flow keeps one owner for workspace/session creation.
- **Scaffold the project client-side from a template.** Rejected: the SDKWork application specifications make the scaffold the agent's first step, and a second template inventory in the client would drift from the specs.
- **Require an explicit directory path before picking.** Rejected: the host directory picker is the product's existing workspace entry point; a text field duplicates it and cannot browse on the web.

## Consequences

- Publishing a demand now fails without a leaf category, and fails without an application form when the type is `development`. Legacy demands keep their free-text category; their `category_id` stays null and they render as before.
- Category codes cannot be edited, so a typo is fixed by creating a replacement node and moving leaves under it. Re-parenting rewrites the subtree's `level` and `path` in one recursive statement and then re-projects demand labels.
- Deleting a category demands an empty subtree and no referencing demands; otherwise the console surfaces the conflict and the operator disables the node instead.
- The demand console depends on the company backend origin. The runtime config gained `companyBackendApiBaseUrl`, defaulting to the platform gateway; a deployment that splits the company backend onto another host must set `VITE_SDKWORK_COMPANY_BACKEND_API_URL`.
- The demand-to-project flow needs a Host directory picker; a composition without one reports the failed step instead of guessing a path.
- The demand console's company backend client is constructed through `pc-admin-core`, and the embed package exports the operator console from its root entry, so this plugin's client bundle also carries the admin modules and the company backend SDK. Splitting a markets-only subpath entry is deferred.
- The company database contract is regenerated from the edited baseline because the module is still in its initialization state. An existing development database needs `pnpm db:init` against a fresh schema, or a manual application of the new table and columns.

## Verification

- `cargo test -p sdkwork-company-service -p sdkwork-company-storage-sqlx-rust -p sdkwork-routes-company-app-api -p sdkwork-routes-company-backend-api` covers the category validation helpers, the storage manifest, and both route manifests; `pnpm run db:validate` and `pnpm run check:api-envelope` cover the contract and envelope.
- `pnpm run api:materialize` and `pnpm run sdk:generate` regenerate the company OpenAPI authorities and the app/backend SDKs.
- `packages/sdkwork-appstore-pc-runtime/src/company.test.ts` pins the tree projection and the application-form guard, and `packages/sdkwork-appstore-pc-admin-demands/src/categoryTree.test.ts` pins tree order, orphan handling, and subtree exclusion.
- `packages/sdkwork-appstore-pc-admin-core/src/services/demands.test.ts` pins the operator port's row projection, validation guards, and operation-tagged failures.
- `packages/client/ui-sdkwork-demand-hall/tests/demand-project.client.spec.ts` pins directory naming, the brief, the prompt rejection projection, every bootstrap phase, and the overlay dismissal; the host spec pins the detail action and the status line.
