# Agent Note: 专家 tab 收敛为一份云端专家目录

Status: implemented

[English](2026-11-28-expert-market-one-cloud-catalog.md) | 中文

## 问题

专家 tab 曾两次回答"我该用哪个专家"。一个 chip 内嵌 SDKWork App Store 的专家目录页，另一个内嵌内置专家包自己的名册面板。两处展示同一份 331 位专家名册，却来自两个数据源——App Store 的数据库与包内的 markdown 资产——筛选、卡片结构与动作都不同，用户得猜哪位专家在哪个视图里。产品要求的参考设计（精选货架 + 五列卡片网格、专家 / 专家团同页、排序控件、分类 chip、每位专家的使用统计）在两个视图里都不存在：包有意拒绝编造精选集合与统计数据，因为数据库拥有的目录并不携带它们。

## 决策

该 tab 只有一个视图，由 `@deepseek-ai/dsh-client-ui-sdkwork-markets` 的 `ExpertsCatalogPage` 绘制，读取 SDKWork Agents 专家目录：`expert_divisions`、`experts`、`expert_teams` 与新增的 `expert_collections`。两个已退役的 chip、它们的导轨与内嵌的 App Store 页面一并删除，连同只为就地渲染该包面板而存在的面板 ledger 装配（`expertMarketPanel.ts`、`ExpertMarketSurface.tsx`）。

参考设计所需的数据现在由数据库拥有，而不由客户端编造。`sdkwork-agents` 新增迁移 `0011_expert_market`——`ai_expert_profile`（编辑型使用次数、徽标、目录顺序、发布时间）、`ai_expert_collection` 与 `ai_expert_collection_item`——由 `database/seeds/common/004_expert_market.sql` 为全部 331 位专家与六个精选集合播种，经 `GET /app/v3/api/ai/expert_collections` 与专家列表新增的四个字段暴露，并落入生成的 TypeScript 与 Flutter App SDK。一个专家仍然是一个受管 agent，专家团仍然是多个专家；页面从同一份目录渲染两类内容。

两个包之间的接缝在行为所在处保持不变。`@deepseek-ai/dsh-client-ui-sdkwork-experts` 保留 `@` 选择器、六个召唤工具、专家团引擎、设置页与它的 `main` 面板；市场页把该面板的侧边栏行声明为已内嵌，因为该 tab 才是专家的导航入口，面板 key 仍是两个包唯一共享的字符串。卡片动作经该包的 `agencyAgents` Remote 执行：「立即体验」先启用专家（或专家团），再用该包自己的引用格式开一个新会话，因此从市场开始的会话与从选择器开始的会话读起来一致。把名册、专家团与两种语言人格推入该 Remote 覆盖层的目录数据面触发也保留，使工具服务于 tab 展示的同一份目录。

有两处目录细节在这条接缝上归属目录而不是页面。专家的 `tags` 是主题标签：读取模型丢弃受管 agent 的词汇（`expert`、`conversation`、`official`、`commercial`）与分类代码；当部署没有播种主题标签时，卡片回退显示分类名，因此卡片不会把记录词汇当作专家描述展示。集合负载按请求语言本地化 `name`/`description` 与每个成员标签（与专家团负载一致），同时保留 `…En` 字段。专家团负载携带完整可运行定义：目标、**共同约束**、交付要求、示例与有序成员，因为该包的专家团运行时正是用这些字段拼装主理人提示词与每位成员的职责说明；共同约束由目录单语言撰写，因此两种语言返回同一段文本。目录的 `name`/`description` 来自唯一的 `ai_agent.display_name` 列，所以最后播种的语言生效；中文产品因此把 `zh-CN` 放在最后播种，同时两种语言的人格集合都必须存在，因为目录校验断言 662 条人格。

## 考虑过的替代方案

- **保留两个 chip，只重绘市场面板。** 两个数据源仍会互相矛盾，而且面板虚拟化的两列网格把卡片几何（`EXPERT_CARD_HEIGHT`）写死，参考设计的五列网格无法在不重写窗口化计算的前提下复用。用一页读一份目录可以消除分歧，而不是把分歧藏起来。
- **在专家包内绘制参考布局。** 该包是能力所有者，不是市场表面；市场拥有页面外框、页头搜索与云端闸门。把画廊放进该包会颠倒这层归属，并让该包依赖市场的网关绑定。
- **为专家保留 App Store 内嵌、只换数据源。** 内嵌页是另一个应用的页面，无法在没有线上契约的情况下读取本仓库的目录，而且它的卡片携带专家目录并不拥有的 App Store 字段。
- **在客户端推导使用统计。** 参考设计里的数字是编辑型展示数据，不是遥测。在浏览器里推导等于把猜测当成事实；现在目录把它们作为播种且版本化的数据携带。
- **集合接口缺失时让整个目录失败。** `expert_collections` 是最新的表面，所以 Agents 构建早于它的部署会返回 404。这只应损失精选货架，名册仍然加载。

## 后果

- 专家 tab 不再有子标签状态，只有一个搜索框与一道闸门：云端目录、共享登录界面或未配置提示。`packages/bundle/web-app/tests/built-in-expert-market.spec.ts` 仍钉住该包、它的 `main` 面板 key 与两行组合。
- 专家团定义现在与该包的专家团契约对齐：`0013` 新增 `coordinator_prompt`，使自定义主理人可被表达（`coordinator_mode = 'custom'` 时必填，模板主理人为空）；`constraints_text` 上限由 4000 收紧到 2000。团队负载同时输出 `constraints` 与 `coordinatorPrompt`，该包的专家团运行时因此能拿到拼装主理人说明所需的文本。随包发布的校验脚本对两处边界仍 fail-closed，后续基线改动无法悄悄引入应用会在注入时拒绝的专家团。
- 页面为每位专家渲染 emoji 图块而非参考设计中的插画头像，因为头像池位于专家包内，而特性插件不得引入另一个特性插件的值。图块按分类推导出一个稳定的装饰色调。
- 部署必须同时带上两侧改动：tab 读取 `expert_collections` 与专家展示字段，因此只发布客户端会得到没有货架与统计的名册。
- 验证：包内组件规格覆盖精选货架、两种视图、三种排序、筛选面、详情弹窗与失败和空状态（`packages/client/ui-sdkwork-markets/tests/experts-catalog-page.client.spec.tsx`）；页面级规格覆盖合并后的 tab 与两个使用动作；`apps/web/tests/expert-market-gallery.e2e.ts` 在真实 chromium 中断言退役 chip 与导轨已消失、tab 始终绘制可操作的界面。数据面由 Rust 单元测试、`pnpm check:expert-catalog`、契约套件与重新生成的 SDK 构建覆盖。线上契约是被挂载验证而非推断的：`http::expert_catalog_http_tests` 用 `tower::oneshot` 打真实合并路由树，对四个接口断言响应信封、分页、展示字段、按语言的集合负载、分类筛选与不存在专家的 `404`。在本地开发数据库上从空 schema 走了一遍部署路径：`db:migrate` 应用基线加 `0011`，`db:seed` 应用该 profile 的六个脚本，`db:status` 报告 clean，随包发布的 `database/verification/expert_catalog_checks.sql` 在单语言播种（331 位专家、22 个分类、5 个专家团、15 位成员、331 条人格、331 条画像、6 个精选集合、18 条成员、无悬空引用）与双语言播种（662 条人格）两种情况下都通过。存储层列表查询在已播种的行上复现 22 / 331 / 5 / 6。独立 agents 网关也能对该数据库启动，启动时的 drift gate 校验了 39 张表的契约；进程级 HTTP 运行不在此证据内，因为网关停在与本目录无关的部署装配上（生产姿态缺审计发射器与 CORS 白名单，开发姿态下 `/healthz` 重复注册）。
- 为达到上述状态，种子门禁本身需要一处框架修复：`sdkwork-database` 的种子扫描器按行屏蔽字符串字面量，于是多行人格字面量携带的正文（`GRANT`、`EXECUTE(`、`--`）被当成 SQL，任何内嵌人格的种子都会被拒。扫描器现在在关键字与注入检查前，先跨行屏蔽单引号、双引号与 dollar-quoted 字面量正文；真实语句与行尾注释仍被拒绝。
- 目录尚未拥有：331 位专家的主题标签。在部署播种它们之前，每张卡片显示所属分类作为主题 chip；补齐属于目录数据改动，不是页面改动。
- 专家团详情弹窗展示目标、共同约束、交付要求与成员；专家详情弹窗按分类名而不是分类代码显示归属。此前两个弹窗一个把约束整段丢掉（读取模型未取该列），一个直接打印分类代码。
