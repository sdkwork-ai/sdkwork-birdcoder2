# Agent Note: 需求大厅分类树、发布时的应用形态决策，以及需求到项目的引导

Status: implemented

[English](2026-10-23-demand-hall-category-and-project-bootstrap.md) | 中文

## Problem

需求大厅无法回答它自己的页面提出的三个问题。发布需求使用自由文本分类，同一个分类被每个发布者拼成不同写法，无法可靠筛选，也无法治理分类。没有任何字段记录需求委托的是哪种形式的应用，服务方在投标时并不知道交付物是 PC 应用、H5 应用、小程序还是别的形态——而工作区里已经有一套完整的 SDKWork 应用架构清单。全新部署的大厅是空的：既没有接单流程说明，也没有可供练习的开放需求。

最后一个缺口代价最大：抢单之后，服务方仍要离开大厅、手工创建工作区与会话，再把需求文本抄过去。需求与它产生的项目之间没有任何共享身份。

## Decision

企业域拥有分类词汇，客户端负责渲染：

- `company_demand_category` 是租户范围内的树（`parent_id`、`category_code`、`display_name`、`display_name_en`、`description`、`app_form`、`level`、`path`、`sort_order`、`status`）。编码是小写 slug 且不可修改；服务层限制四层深度。节点上的 `app_form` 是选中该节点时发布表单预填的默认应用形态。
- `company_demand` 新增 `category_id`、`category_path` 与 `app_form`。服务层从分类行解析展示名与路径，而不是信任发布者文本；只接受**末级**分类；`development` 需求必须提供 `appForm`。分类改名或改挂父级后，会把它下面的每条需求的 `category`/`category_path` 重新投影，因此需求行不会残留旧标签。
- 应用形态就是 SDKWork 应用架构规范，一码一规范：`pc`、`h5`、`static-web`、`miniprogram`、`flutter`、`uniapp`、`android-native`、`ios-native`、`harmony-native`、`unity`。企业服务、OpenAPI 权威、应用商店前台与管理台各自在一处读取这个封闭集合。
- `GET /app/v3/api/company/demand_categories` 向发布表单提供分类树（权限 `company.demand_categories.read`）。`GET/POST/PATCH/DELETE /backend/v3/api/company/demand_categories` 是运营接口（权限 `company.demand_categories.manage`）；节点存在子分类或被需求引用时拒绝删除。
- 初始化数据以种子形式随仓库发布：分类树、一条引导式接单教程需求（“第一次接单：从抢单到交付”，依次走 抢单 → 定标 → 交付 → 创建项目），以及 PC、小程序、静态站三条示例需求。截标时间使用相对时间（`now() + interval`），种子数据不会一落地就过期。
- 应用商店 PC 的发布弹窗把分类树渲染成级联菜单（每层一列，分支向下一列钻取，只有叶子可选），并提供应用形态标签选择器，选中分类时按其默认形态预填。需求卡片与详情展示分类与应用形态。
- `/admin` 运营控制台新增 `demands` 能力模块（`sdkwork-appstore-pc-admin-demands`），经 `pc-admin-core` 的 `demands` 端口治理分类树。该端口通过 `createAppstorePcAdminCompanyBackendClient` 访问企业后台 SDK；需求域仍归企业后台 API 所有，应用商店控制台保留自己的后台客户端。
- BirdCoder 需求大厅插件承载“需求到项目”动作：嵌入式前台渲染详情按钮，宿主创建项目。端口选择父目录、按标题创建项目目录（重名追加数字后缀）、注册并重命名工作区、连接其空白会话、打开会话，并把需求简报作为第一条提示发送。简报包含需求编号、标题、分类、预算、截标时间、详情、应用形态，以及管辖它的 SDKWork 规范。项目创建成功后关闭需求大厅浮层，否则新会话会被浮层挡住。进度与失败以目录上方一行状态展示。

## Alternatives considered

- **保留自由文本分类并按字符串分组。** 否决：筛选、徽标与级联菜单都需要稳定 id 与路径；字符串分组也无法约束叶子选择，更无法在改名后保持一致。
- **把分类体系做成客户端常量。** 否决：运营无法新增或停用分类，种子数据与发布校验会和客户端不一致，两个表面（前台与 BirdCoder）还要各存一份。
- **让应用形态可选、之后再推断。** 否决：应用形态决定服务方承诺什么、哪份规范管辖交付；把它推迟，等于把发布时的决策推给投标对话。
- **只在分类上存应用形态。** 否决：同属“Web 应用”的两条需求可能一个是静态站、一个是 PC 系统；分类默认值只是便利，不是决策本身。
- **在已有会话里提示来创建项目。** 否决：项目需要在第一轮之前拥有自己的目录与工作区；复用新会话流程还能让工作区/会话创建只有一个归属。
- **客户端按模板脚手架化项目。** 否决：SDKWork 应用规范要求把脚手架作为智能体的第一步，客户端再存一份模板清单会与规范漂移。
- **先要求显式输入目录路径再选择。** 否决：宿主目录选择器就是产品既有的工作区入口；文本框既重复它，又无法在 Web 端浏览。

## Consequences

- 发布需求现在缺少末级分类就会失败；类型为 `development` 时缺少应用形态同样失败。历史需求保留自由文本分类，其 `category_id` 为空并按原样渲染。
- 分类编码不可编辑，因此拼写错误要通过新建替代节点并把叶子改挂过去来修正。改挂父级会在一条递归语句里重写子树的 `level` 与 `path`，随后重新投影需求标签。
- 删除分类要求子树为空且没有需求引用；否则控制台呈现冲突，由运营改为停用该节点。
- 需求控制台依赖企业后台源。运行时配置新增 `companyBackendApiBaseUrl`，默认指向平台网关；把企业后台部署到独立主机的部署必须设置 `VITE_SDKWORK_COMPANY_BACKEND_API_URL`。
- 需求到项目流程需要宿主目录选择器；缺少该能力的组合会报告失败步骤，而不是猜测路径。
- 需求控制台的企业后台客户端由 `pc-admin-core` 构造，而嵌入包的根入口同时导出运营控制台，因此本插件的 client bundle 也携带了管理模块与企业后台 SDK。拆分 markets-only 子路径入口的工作延后。
- 企业数据库 contract 因模块仍处于初始化状态而从编辑后的基线重新生成。已有的开发数据库需要针对全新 schema 运行 `pnpm db:init`，或手工应用新表与新增列。

## Verification

- `cargo test -p sdkwork-company-service -p sdkwork-company-storage-sqlx-rust -p sdkwork-routes-company-app-api -p sdkwork-routes-company-backend-api` 覆盖分类校验辅助函数、存储清单与两份路由清单；`pnpm run db:validate` 与 `pnpm run check:api-envelope` 覆盖 contract 与响应信封。
- `pnpm run api:materialize` 与 `pnpm run sdk:generate` 重新生成企业 OpenAPI 权威与应用/后台 SDK。
- `packages/sdkwork-appstore-pc-runtime/src/company.test.ts` 钉住树投影与应用形态校验，`packages/sdkwork-appstore-pc-admin-demands/src/categoryTree.test.ts` 钉住树顺序、孤儿处理与子树排除。
- `packages/sdkwork-appstore-pc-admin-core/src/services/demands.test.ts` 钉住运营端口的行投影、校验守卫与带 operationId 的失败。
- `packages/client/ui-sdkwork-demand-hall/tests/demand-project.client.spec.ts` 钉住目录命名、简报、提示拒绝投影、每个引导阶段与浮层关闭；宿主测试钉住详情动作与状态行。
