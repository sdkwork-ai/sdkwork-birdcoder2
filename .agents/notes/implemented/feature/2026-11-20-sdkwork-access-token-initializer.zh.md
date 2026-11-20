# Agent Note: 工程行菜单初始化 SDKWork 应用访问令牌

Status: implemented

[English](2026-11-20-sdkwork-access-token-initializer.md) | 中文

## Problem

每个带清单的 SDKWork 应用根都按 Profile 持有一个公共应用访问令牌——Vite 根是 `.env.<profile>`，Flutter 是 `env/sdkwork.<profile>.json`，微信小程序是 `config/mini-program/runtime-env.<profile>.json`，Harmony 原生与其他 JSON 运行时根是 `config/app/runtime-env.<profile>.json`（`APP_ACCESS_TOKEN_SPEC.md` §2）。规范写入器是仓库级 `tools/materialize-client-env.mjs`，它同时物化 URL 与绑定。此前无法从工作区浏览器针对单个工程初始化令牌矩阵：操作者必须用正确的环境变量运行仓库工具，知道每种应用格式对应哪个 Profile 文件，而且租户级 / 组织级的声明差异（`organization_id=0` 还是非 0 组织，§3.2）很容易手写出错。

fork 已经拥有工程行的右键菜单，但没有任何动作通过浏览器的目录桥读写应用根。

## Decision

新增 fork 插件包 `ui-sdkwork-access-token`（`@deepseek-ai/dsh-client-ui-sdkwork-access-token`）提供 Access Token 初始化能力，工程行菜单为 `sdkwork-*` 工程目录增加一行：

- **菜单行** — `ui-sdkwork-workspace-row-menus` 从注入面读取可选的 `accessTokenInitializer` 服务（用 `ctx.get`，缺少新插件时其他行不受影响），仅在被点击目录的基名以 `sdkwork-` 开头时显示 **初始化 Access Token**。同一动词还通过 `ctx.contextMenus.register` 贡献给共享工作区右键菜单——那是没有部署行菜单插件的组合的右键入口。
- **令牌** — `src/client/accessToken.ts` 在浏览器中重建 `tools/app-access-token.mjs` 的 §3：固定头部（`alg: none`、`kid: public-app-token`）、必需声明、租户级（`organization_id=0`、`TENANT`）或组织级（非 0 组织、`ORGANIZATION`）推导、确定性的生成时刻，以及在声明矛盾时失败关闭的解码器。基准 fixture 把两种级别的字节钉在规范生成器的输出上。
- **发现** — 弹窗扫描被点击的工程目录（自身带 `agent.app.config.json` 时就是自身，否则是其 `apps/*` 子目录），并从清单读取各根的身份。没有任何带清单应用根的工程会得到说明，而不是伪造一个身份。
- **写入** — 每个选中应用根 × Profile 都按格式合并进其已提交文件：dotenv 保留其余每一行，JSON 运行时文档保留其他成员，Harmony 模板保留其嵌套形状。整个请求在第一次写入前完成校验；单个不可读文件只会使该文件失败。重复执行未变化的初始化会把所有文件报告为未变化且不写任何文件。
- **文件访问** — 浏览器侧从不直接接触文件系统：读写经由受治理的 `uiWorkspace` 目录桥（`readTextFile`/`writeTextFile`/`listDirectory`/`createDirectory`），Host 继续持有文本上限与路径规则。
- **签名模式** — 第二种模式先登录，再把单个应用交换为签名凭据。登录顺序：已挂载的 IAM 会话（`ctx.iam` 的 access/auth 令牌与账号 ID）、DSH home 设置分区中该工程记住的登录（`ui-sdkwork-access-token` → `accounts[project]`）、表单输入；密码登录以公共引导令牌作为 credential-entry 的 `Access-Token`。Host 侧拥有标准设置分区，并原子投影到 `<DSH_HOME>/sdkwork/access-token.config.json`（`0600`）；浏览器通过 `ctx.configForms` 读写该分区。`admin`/`operator` 登录会 upsert 到该分区（幂等）；普通账号绝不落盘。部署应用列表过滤为当前用户创建或独占的应用，交换前再次校验归属，响应在展示前解码校验（不是 `alg:none`、`app_id`/`aud` 等于锚点、发布范围与安装一致、`USER` 发布指向会话用户、租户一致、1 小时生命周期类别、`expiresAt` 未到期）。签名凭据是会话级凭据，绝不写入已提交的 Profile 文件。

## Alternatives considered

| 被否决方案 | 一句话理由 |
|---|---|
| 从新的 Host Remote 启动 `materialize-client-env.mjs` | 该工具会从 `etc/topology` 物化 URL 与绑定；本需求是单个工程的令牌矩阵，Host 进程会重复清单已经携带的身份解析 |
| 绕过目录桥由浏览器直接写文件 | 插件将自建 RPC，并失去桥已提供的文本上限、父目录规则与取消能力 |
| 用令牌值整体替换 Profile 文件 | 会丢掉 Profile 文件同时携带的 URL 与绑定；合并保留每一个外部键 |
| 对所有工程目录都显示该行 | 令牌只属于带清单的 SDKWork 应用根；非 SDKWork 工程只会进入空状态 |
| 仅按清单硬编码应用类型 | uni-app 根、清单沉默的 Vite 根与 Harmony 模板在清单与文件之间并不一致，因此检测还会读取根标记，并允许操作者在弹窗中覆盖 |
| 跳过登录，在弹窗中直接生成长期签名令牌 | 客户端伪造签名应用凭据会绕过 IAM 的归属授权与撤销；只有 §8 交换可以签发，且只能签发给登录用户本人创建的应用 |
| 把交换得到的签名令牌提交进 `SDKWORK_ACCESS_TOKEN` | 该载体只接受 credential-entry 路由上的公共 `alg:none` 隔离令牌；签名会话凭据在那里会被拒绝，且绝不允许提交（1 小时、可撤销） |
| 每次登录都落盘，或让操作者每次重输特权凭据 | 只记住 admin/operator 服务账号，保存在 Harness home 下的标准设置分区，并投影到 `<DSH_HOME>/sdkwork/access-token.config.json`（`0600`）；普通用户密码绝不落盘，保存幂等且界面有提示 |

## Consequences

在工作区浏览器中右键 `sdkwork-*` 工程会出现 **初始化 Access Token**。弹窗有两种模式。公共模式发现应用根、根据清单组织绑定给出默认令牌级别，让操作者选择级别（租户级或组织级及组织 ID）、每个应用根的应用类型与运行时目标、以及 Profile 子集，预览隔离声明并初始化矩阵。签名模式复用已挂载 IAM 会话或用配置/表单账号登录，只列出该用户创建的应用，交换选定应用并展示可复制的签名凭据。结果列表报告每个已写入、未变化或失败的文件。

仓库级物化器仍是完整物化的规范所有者：本初始化器只写 `SDKWORK_ACCESS_TOKEN`（以及 Harmony 模板的 Profile 身份键），因此固定部署锚点的声明仍是其自身运行的来源；弹窗可以把该锚点作为覆盖输入。签名凭据是另一类材料：由 IAM 签发、约 1 小时有效、可撤销，并刻意不进入已提交矩阵。

验证位于 `tests/`：`access-token.client.spec.ts`（规范字节与失败关闭的范围规则）、`application-types.client.spec.ts`（格式表、检测、Host 路径拼接）、`project.client.spec.ts`（应用根发现与清单身份）、`initializer.client.spec.ts`（合并策略、目录创建、幂等性、逐文件失败）、`access-token-settings.client.spec.ts`（工程键、查找/upsert、投影文档、页面全局解码）、`access-token-host.client.spec.ts`（DSH home 目标、设置分区 schema、原子写入、提交后重写、写失败日志）、`signed-token.client.spec.ts`（特权账号识别、归属过滤与凭据校验）、`sdkwork-iam-port.client.spec.ts`（真实 SDK 传输：登录/列表/交换的路由、请求头、请求体与信封）、`access-token-dialog.client.spec.tsx`（公共模式发现、级别选择、初始化、空/不可用状态、设置面保存）、`signed-token-panel.client.spec.tsx`（自动/手动登录、特权账号保存、本人应用列表、交换、校验失败）以及 `apply.client.spec.ts`（服务、浮层、右键菜单贡献、IAM 会话接线、设置读写、卸载）。行菜单测试套件补充该行的出现条件与派发。

工程行菜单动作沿用 [Project publish and canonical app linkage](2026-10-23-project-publish-entry-and-canonical-app-linkage.zh.md) 的发布入口模式：菜单行只携带被点击的目录，具体流程由拥有该动作的插件通过注入服务提供。
