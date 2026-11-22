# Agent Note: A packaged application access token is permanent and every application type carries one

Status: implemented

[English](2026-11-20-permanent-application-access-token.md) | 中文

## Problem

公开应用访问令牌是客户端在交互式会话出现之前唯一持有的凭据：它为凭据入口引导 （credential-entry bootstrap）解析租户、组织、应用、环境和部署档位。实际提交的令牌 矩阵没有真正满足三条规则：

- 它带着过期时间发布。生成器把 `exp` 写死为 `2100-01-01T00:00:00Z`，标准称其为"远期 轮换截止时间"。被打包进应用的令牌无法由该应用自行续期，于是这个模型让已发布的构建 可能在无人安排日期的那天失效，而且具体截止时间可以在没有任何门禁反对的情况下进入 安装包。
- 覆盖范围是按仓库而不是按应用类型计算的。五个 `apps/*` 根持有矩阵，而构建 Web/Desktop 壳的仓库根的部署文档（`.env.<profile>`）没有；十个 profile 里只有六个 存在，壳的 staging 或 demo 构建根本没有载体。`.gitignore` 甚至忽略了 staging profile，全新检出根本无法拥有它们。
- 两个隔离级别没有明确说明各自隔离什么。租户级（`organization_id = 0`）与组织级 （非零）在机制上受支持，但"按租户做键"与"按租户 + 组织做键"的差别只隐含在解析器 里，而生成器默认的 `exp` 进一步掩盖了一个事实：级别是安装的属性，不是请求的属性。

## Decision

公开应用访问令牌**默认永久有效**，且**每一种应用类型都必须携带一个**。

`exp` 为 `0`，即规范的无过期哨兵值。`sdkwork-specs` 的生成器 （`PUBLIC_APP_ACCESS_TOKEN_NO_EXPIRY`）与 IAM 的解析器 （`APPLICATION_ACCESS_TOKEN_NO_EXPIRY`）对它取值一致，缺省该声明含义相同；任何具体 截止时间都是显式选择的轮换窗口，且必须晚于生成时刻。 `assertApplicationAccessToken` 拥有生命周期判定：永久令牌永远通过，已过去的 具体截止时间带声明名被拒绝，所有门禁调用同一个函数，而不是各自重新推导规则。

矩阵按根计算。每个带清单的根以及构建 Web/Desktop 壳的仓库根都必须携带全部十个 profile，无论其应用类型是什么。仓库根的 `.env.<profile>` 文档是手写维护的，因此物化 器新增 `dotenv-root` 格式与 `mode: "token-only"`：只重写 `SDKWORK_ACCESS_TOKEN` 这一 行，保留其余每个字节（文档、URL、空值占位键），拒绝声明了其他 profile 身份的文档， 且 `--check` 只比较这一行。仓库在 `etc/client-env.materialization.json` 中声明该 surface，于是既有门禁以与五个 `apps/*` surface 相同的规则覆盖它。

两个级别是两把隔离键，写进了标准：租户级以 `tenant_id` 做键、`organization_id = 0`； 组织级以 `tenant_id` 加安装的非零组织做键。级别由安装与 surface 声明决定，永远不由请求 决定，客户端不得放宽或重新划定已发布令牌的作用域。

级别只声明一次：`accessToken.organizationId` **就是**级别（非零 → `ORGANIZATION`， `0` → `TENANT`），surface 不必再用 `accessToken.ownershipScope` 重复；显式作用域与 `SDKWORK_APPLICATION_OWNERSHIP_SCOPE` 覆盖仍然优先，但必须与绑定一致， `accessToken.scope` 仍是显式守卫。矛盾会在解析阶段失败，不会先生成令牌。浏览器侧生成器与 初始化器遵循同一规则：显式租户级搭配非零组织 id 会直接失败，而不是把绑定悄悄抹掉； 对话框在操作者切回租户级时会清空组织字段。多根初始化拒绝改变根的发布级别：租户级请求不能 覆盖组织绑定 surface，组织级请求必须写出该根自己的组织。

服务端投影同一组键。IAM 解析公开应用令牌（或为打包部署签发 standalone bootstrap 凭据） 时，把 `data_scope` 设为 `tenant:<tenant_id>`；组织级发布再追加 `organization:<organization_id>`，`USER` 发布追加 `user:<owner_user_id>`；租户级凭据永远 不带组织键。这与会话凭据的投影一致，因此按 `data_scope` 过滤的数据面会把组织级凭据限制在 其组织内，同时 `IamShardingContext` 将其路由到组织分区（`DATABASE_SPEC.md` §16）。

surface 声明还要与其根目录的 `agent.app.config.json` 对齐：`tenantId` 必须等于 `backend.tenantId`；清单声明了非零 `backend.organizationId` 时，不允许发布该组织之外的 令牌。物化声明仍是仓库客户端应用类型的权威清单——仅服务端或非客户端根 （`format: "none"`）不在矩阵内——因此门禁校验每个已声明 surface、其矩阵以及与清单的 一致性，而不是猜测未声明的根。

## Alternatives considered

**保留 `2100-01-01` 轮换上限。** 对任何真实部署它实际上等同永久，且无需改动任何消费 方。被否决，因为"实际上"正是产生该缺陷的歧义来源：标准称存在过期，于是运维可以设置 真实截止时间，而没有任何东西区分合法轮换窗口与误设。显式的 `0` 哨兵只有一个含义， 且 IAM 已经实现它。

**完全省略 `exp`。** 这是 JWT 语义上最干净的"永不过期"，门禁也接受。它没有被选为 生成器默认值，因为部分严格校验器要求该声明存在；保留 `exp` 并使用有文档的哨兵既无 歧义又兼容，同时缺省声明仍被接受，以容纳已在别处提交的令牌。

**启动时刷新短寿命令牌。** 这能让隔离凭据不进入长期存在的安装包。被否决，因为令牌 必须在登录前与离线时可用：首屏时往往既无会话也无网络，刷新路径会让登录前引导反过来 依赖它本应引导的凭据通道。

**完全生成根 `.env.<profile>` 文档。** 这能消除 token-only 特例。被否决，因为这些文档 承载手写的部署说明、产品密钥占位与启动环境备注，生成文件会抹掉它们；只拥有一行是 更小、更可评审的契约。

## Consequences

- 提交的矩阵现在带有 `ownership_scope` 与 `exp: 0`；60 个 profile 文件（六个 surface × 十个 profile）不再过期，`materialize-client-env --check` 通过。
- 打包构建无需按计划续期即可持续工作；轮换是显式的 `token_version`/`issuedAt` 变更， 或一个刻意设置、受门禁约束的轮换窗口。
- 根 surface 现在由 `check-app-access-token-env.mjs` 与 `check-release-access-token-env.mjs` 校验；缺失的四个 profile（staging/demo， standalone/cloud）已存在，因此 `staging` 与 `demo` 的壳构建也有载体。
- `readTokenTimestamps` 不再把永久令牌的过期记录成 `1970-01-01`。
- 部署仍必须注入自己的部署应用 id；提交的占位值 （`__SDKWORK_DEPLOY_APPLICATION_ID__`）在打包期物化，源码检出按设计在 `--require-anchor` 下失败。
- 组织级发布只需一个字段（`accessToken.organizationId`）即可声明，两个门禁都按推导出的 `ORGANIZATION` 期望校验；与绑定矛盾的作用域或覆盖会在生成前失败。
- 与根清单漂移的声明（另一个租户，或组织绑定应用发布该组织之外的令牌）会在物化与两个 门禁中失败，而不是产生应用并不拥有的隔离上下文。
- 组织投影由 DB 集成测试覆盖：分别解析租户级、组织级与个人令牌，并断言只有组织级发布的 持久化 data scope 带 `organization:<id>`，公开令牌解析与 bootstrap 签发两条路径都覆盖。
- 共享发布的 bootstrap 凭据由"租户作用域"的合成主体（`system:<tenant_id>`）承载，而不是 一个全局 `system` 用户：`iam_user.id` 的全局主键否则会让数据库上只有第一个租户能签发 standalone bootstrap 凭据。
- 只按行 id 匹配的运行时写操作现在同时绑定 `tenant_id`：密码凭据/用户更新、会话吊销、 刷新会话吊销与轮换、作用域刷新、服务账号会话吊销、API Key 最近使用时间、provider 凭据 回读。不透明令牌哈希与 ephemeral key 查询仍按设计全局匹配——呈递的秘密本身是唯一选择 器——这是 `DATABASE_SPEC.md` §16 记录的跨租户例外。
- 根 profile 缺失的仓库现在会被门禁判为失败，而不是悄悄发布一条空凭据，因此无法在 缺少载体的情况下新增一种应用类型。

## Testing

`sdkwork-iam` 的 `pnpm run check:database` 会运行仓库级 SQL 作用域门禁： `database/contract/sql-scope.json` 为每张租户表声明分类，并登记每一条经评审的跨租户例外； `scripts/check-sql-tenant-scope.mjs` 会让任何忽略该分类的读、插入、更新、删除失败。全舰队 的可选作用域谓词检查仍由 `check-tenant-isolation-sql.mjs` 负责。

级别区分在可能回归的地方都有测试钉住：混合级别仓库夹具会在同一仓库里物化并校验一个租户级 surface 与一个组织级 surface，门禁测试把租户级令牌换到组织级 surface（以及反向、以及外来 组织），DB 归属测试断言租户级令牌无法解析组织级安装或另一个组织的安装，IAM 解析器测试断言 安装只接受与其级别和组织一致的声明，隔离键测试断言只有租户级是共享级别且强制使用组织哨兵 值，DB bootstrap 测试为两个租户分别签发并要求两个相互独立的租户作用域主体。
