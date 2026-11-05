# BirdCoder 更新日志

本文件只记录**当前版本**——`##` 标题就是本次发布打的 tag，不累积历史版本条目；往期条目随各自版本的提交保留在 git 历史里（`git log -p CHANGELOG.md`）。「上游变更」逐字摘自上游该 release 的官方 Release notes（中文部分，英文版见各 Release 页面）；上游尚未发布 Release notes 时，按该 tag 内的实际提交归纳并注明来源。「BirdCoder 本地修改」记录 fork 在该版本上的自有变更（SDKWork 组件、品牌、打包与部署等），不受上游发布节奏影响。

## 0.2.2-rc.1（fork 发布 2026-11-05）

本版本把上游 `dsh-v0.2.2-rc.1`（`8bd073392e` → `fcc0ad4621`，260 个提交、其中 180 个非合并提交）整体合并进来，并结清上一轮尚未发布的自有改动（打在 `birdcoder-v0.2.2-alpha.6` 之后的 alpha.7 内容）。合并是真实的 merge commit：上游提交与提交信息逐条保留，不压缩、不改写。冲突一律 fork-first 解决——SDKWork 组件、BirdCoder 品牌与发布车道不被上游覆盖，双方都改过的同一行为取并集后按上游新结构落地。

### 上游变更

> 上游尚未发布 `dsh-v0.2.2-rc.1` 的 Release notes（该 tag 只有构建产物里程碑），以下按 `8bd073392e..fcc0ad4621` 区间内的实际提交归纳。

#### 新增功能

* 桌面端发布支持分阶段灰度：发布时可配置灰度比例，未显式指定时默认全量。
* macOS 编辑菜单把 Paste and Match Style 绑定到 ⇧⌘V，保留 ⌥⇧⌘V 作为隐藏别名；Substitutions 与 Speech 标题改由桌面端语言包提供。
* 「在原生应用打开」收进会话菜单，原先的独立 header 入口与其模块一并移除。
* 失败的轮次可以用空输入继续；Web 端在瞬时请求失败后继续生成，并对已接受输入的重复重试去重。
* 聊天把上下文注入显示为工具调用行；`apply_patch` 行标出它改动的文件，并可逐个打开。
* 子代理在创建者目录里带上名字，持久化名称经过校验。
* 变更请求（Forge）可选择本地改动的基线分支，合并按钮改用产品强调色与实心折角。
* PTC：保留环境支持 Host 重置，协作式取消后保留运行时状态。
* CUA：应用审批的风险说明与会话选择更明确。
* 发布车道复用源码字节一致的 CUA helper 构建，并把构建绑定到 Actions run 的提交。

#### 体验优化

* 审批风险卡改用 CSS 锚点定位，浮层在页面缩放时保持与触发器对齐。
* PDF 文本层改为分离布局，并挂到真正承载样式的节点上，修复预览错位。
* 风险标签、合并按钮的悬停与焦点行为统一，浮层在焦点或前台丢失时关闭。

#### 问题修复

* 会话窗口在增量 flush 失败后重建，不再停留在半更新状态。
* inspect 的 Cordis 快照预算为记录开销预留额度，并拒绝没有快照预算的 source-frame 限制。
* 桌面端发布通道与版本后缀解耦，更旧来源的工作流模式可正确桥接，工作流版本模式命名更清晰。
* 安装器产物保留修改时间，改用系统 ZIP 写入器并校验归档失败。
* 桌面端归档设置在保留文件之前校验；保留件的时间戳与命名说明一致。
* `ui-goal` 在中文下区分「未激活」与「已暂停」。
* PTC 的诊断用自然语言给出每分钟调用预算与上限。
* 修复多文件 patch 行在悬停时高亮到整行、以及 `experimental/` 前缀出现在新包名里的问题。

#### 其他变更

* 同步 vendor：Cordis 4.1.0、Loader 1.1.0、Include 1.1.0、HMR 1.1.0、Timer 1.2.0、cosmokit 1.9.0、schemastery 3.19.0。
* 客户端打包允许内联 `dsh-fs-patch`。

### BirdCoder 本地修改

#### 合并与冲突解决（fork-first）

* 工作区行与会话行的菜单触发改用上游新增的 `contextMenu.button` 工厂，同时保留 fork 的 `sidebar.workspaces.rowMenus` 菜单 seam：插件接管时由插件画整块菜单与自己的触发器，未接管时退回共享右键菜单。插件路径下的行右键继续走 pointer 通道，未接管时交给共享菜单容器。
* 会话页头把上游新增的 `renderFactorySlot` 通道贯通到 fork 拆分的 header body，末尾「更多」按钮由 `contextMenu.button` 提供，`sessionHeader` 目标与上游一致。
* 桌面端语言包保留 BirdCoder 品牌名（8 个语言的 退出/打开 条目），同时引入上游新增的 Substitutions 与 Speech 菜单标题。
* 桌面端打包环境读取保留 fork 的 `baseDir` 语义（模板内相对路径按 `apps/desktop` 解析）。上游把该读取器抽到 `desktop-file-settings.mjs`，其签名不接收 `baseDir`，因此 fork 保留本地副本并在代码里注明分歧原因与同步要求。
* 客户端 bundler 的内联白名单保留 fork 的 `host-apiproxy` 与 `client-sdkwork-office`，并接收上游新增的 `fs-patch`。
* 保留 fork 的发布决定：不引入 `release-publish.yml` / `scripts/release/publish.ts`（`birdcoder-v*` tag 走 `container-release.yml`），上游针对这两份文件新增的测试块按该决定删除。
* 锁文件里 357 个只差版本号的包统一采用上游 `0.2.2-rc.1`；`ui-approval` 新增的 `react-dom` 按 fork 的 React 19 口径记为 `19.2.8`，锁文件中不再有 `^18.2.0` 的 specifier 残留。

#### 承接上一轮未发布的改动

* 左侧栏会话列表的滚动交接与面板启动器不再丢位置、不再被「更多」菜单吞掉。
* 客户端 inspect 清单改为等 Host 代次就绪后再发布；网关不再把精确路由自己的 404 当成回落信号；变更摘要按「无内容」回答。
* 36 个 SDKWork 兄弟仓 pin 一次性前进到各自已推送的 `origin/main`（`sdkwork-appbase` → `1fc30502`），两条 pin 记录逐字一致。
* `plugins/dsh-im` 子模块跟到 `v5.10.0`（`c826bfa4`）。

#### 合并后新增

* 输入框的 Add 区新增「技能 / MCP / 知识库」三行（`ui-sdkwork-capabilities`）：每行只在自己被打开时加载对应目录（会话可用的技能、托管 MCP 服务器、已登录用户的知识库），复用共享的 popupSelect 外壳做搜索与键盘选择，选中结果落进当前草稿——技能插入 `/name` 手势交给 Host 展开、MCP 插入「用这台服务器的工具」的指令、知识库插入链接与检索到的段落（检索为空或失败时保留链接并给出提示，不阻塞这次选择）。子代理会话与没有保留绑定的会话不出现这三行。
* 设置菜单在 relay API key 行之上新增「公众号账号」行（`ui-sdkwork-official-accounts`）：打开的是账号表格加自定义菜单编辑器的弹层，内容是 SDKWork IAM 的 `@sdkwork/iam-pc-oauth` 面板，挂在新增的 root 级 `settings.officialAccounts` 座位上，开合语义与 API key 弹层一致。
* 前端插件加载前的启动页渲染 fork 品牌 lockup（图形在名称上方，`boot-brand.ts`），不再回落到上游 wordmark；标记同时是文档 favicon 的同一份栅格。
* 知识库服务（`ui-sdkwork-knowledge`）新增目录与检索接口 `knowledgeBases`，供上面三行消费。

#### 本轮新增（登录与桌面端）

* 产品登录入口在「浏览器交接」状态下新增一行安静操作「内置弹窗登录」：它复用共享 `LoginPanel` 的次要操作排版，调起的仍是 `modal` 设置所调起的同一个账户表单（`IamService.openSignInMethods()`），所以浏览器登录无法完成时不用改 Host 设置也能进应用。可见性由 `IamService.usesBrowserHandoff()` 单一判据决定——已配置 `signInMethod: modal`、或页面没有桌面端 deep-link 桥接时该行不出现，避免与 Sign in 重复。`LoginPanel` 的样式让这一行跟在操作列最后一个按钮之后，双按钮列（桌面欢迎窗的 API key 页）渲染像素不变。
* 桌面端 IAM 会话文件（`<DSH_HOME>/iam/session.json`）在系统提供密文存储（Electron `safeStorage`：DPAPI / Keychain / libsecret）时整体加密后落盘，写入仍是临时文件 + 原子改名 + `0600`；没有可用密文服务时保持明文，读到无法解密的信封按「无会话」处理。Host/CLI 等外部读者改走应用 IPC 桥，不再直接读文件。
* IAM 回调（deep link）落到正在运行的工作区时把它带到前台：待完成的 PKCE 流程与 deep-link 监听只存在于工作区渲染进程，重启时的回调仍由 `openInitialWindow` 处理。
* 开发运行打开的独立 Renderer DevTools 会重新贴回产品图标（`devtools-icon.ts`），Windows 任务栏分组与缩略图不再退化成 `electron.exe` 的默认图标。

#### 本轮追加（品牌 OAuth 与登录状态）

* 品牌身份不再写死在 OAuth 配置里：桌面端 `brand.ts` 按当前品牌派生 OAuth client 身份，CLI 启动脚本（`apps/desktop/cli/birdcoder*`、`prepare-cli.ts`）跟随同一品牌选择；`brands/README*` 与 `v0.2.2-alpha.2/oem-iam-oauth-client` 升级指南同步说明。
* 浏览器登录失败的卡片会点名失败步骤：`IamBrowserLoginFailure` 把桌面运行时的错误码（`provider-denied`、`exchange-failed`、`flow-expired`、`state-mismatch` 等）映射成产品文案，未知码回落通用提示；失败卡片同时保留「应用内登录」回退，避免把租户送回上一步。
* deep-link 登录完成后的状态跨回调保持：待完成的 PKCE 流程由工作区渲染进程续接，`iam-runtime.ts` 统一广播刷新与登出，重启时的回调仍由 `openInitialWindow` 处理。
* 凭据轮换不再只更新内存 store：`onTokens` 统一走 `observeSessionTokens`，刷新后的 access/auth token 立即同步到全局 SDK transport，飞行中的请求不会继续携带旧凭据。
* 修稳 pre-expiry 刷新用例：批量运行时调度器可能在「刚登录」断言之前就触发，该断言改为接受登录态或已轮换的令牌，后续仍严格等待轮换后的令牌与 auth token。

#### 依赖与打包

* `plugins/dsh-mcp-connector` 子模块跟到 `v0.2.94`（`2057af5`，release 提交）：该版本只抬版本号与启动期工具发现，`peerDependencies`/`engines` 与依赖集合未变，锁文件无需改动。
* 36 个 SDKWork 兄弟仓 pin 在本轮结尾再次整体前进到各自当前 `origin/main`，两条 pin 记录（`scripts/sdkwork-sources.manifest.json` 与 `agent.workflow.json`）逐字一致；发布车道按 pin 克隆后 `pnpm install --frozen-lockfile` 通过（main 上的 `Release (dsh)` 在 `Install (immutable)` 处为绿）。
* `plugins/dsh-better-sidebar` 子模块跟到 `v0.30.0`（`11e6c8e6`，43 个提交）：该版本把基线抬到 DSH 0.2.2-rc.1，peer 与 `engines.dsh` 都要求 `>=0.2.2-rc.1`，与本次发布的主机版本一致；旧 pin（`0.29.0`）的 peer 仍停在 `^0.2.1-rc.1`。
* `sdkwork-iam` pin 前进到 `920b01af`（`scripts/sdkwork-sources.manifest.json` 与 `agent.workflow.json` 逐字一致）：`pnpm-workspace.yaml` 已把 `sdkwork-iam-pc-oauth` 列为成员，而旧 pin 上发布车道克隆出的兄弟仓没有这个目录，工作区解析会在打包前就失败。
* 插件随子模块前进把 devDependencies 从 `0.2.1-rc.1` 抬到 `0.2.2-rc.1`，锁文件里 0.2.1-rc.1 的 700 余条 registry 解析随之消失，改由工作区链接提供；`pnpm install --frozen-lockfile` 通过。
* 合并把上游抬到 `0.2.2-rc.1` 时，fork 自有包的版本号仍停在 `0.2.2-alpha.7`，而 `pack-local-packages` 的版本校验要求同一 family 的所有成员同版本，六个平台的桌面打包都会在 pack 阶段直接失败。本轮把 75 个 fork 清单（70 个 `packages/*`、5 个 `apps/sdkwork-*`）统一到 `0.2.2-rc.1`，`verify-version-sync` 的报告是 450 个清单一致。

#### 开发体验

* `desktop:dev` 的参数解析抽到 `development-arguments.ts`，并先丢掉 argv 里的 `--` 分隔符：`pnpm desktop:dev -- --gateway domain` 这种 pnpm 文档写法此前会被 `parseArgs` 当成位置参数而直接报错。

### 校验

* 上游改过、fork 未改的 1196 个文件与 `upstream/master` 逐字节一致（0 失配），即上游改动全部落地、没有被 fork 侧覆盖。
* 上游本轮删除的 3 个模块（`session-reveal`、`useAnchoredPosition`、`HeaderAction`）在源码中已无引用，随上游一并移除。
* fork 自有文件 3309 → 3300，差额即上述 9 个上游重构删除的文件（含对应测试），无其他 fork 文件丢失。
* 品牌契约逐项复验：`FishLogo` 仅存于 ui-primitives，`BirdLogo`/`BirdWordmark`/`LoginPanel` 均落在 fork 自有表面，窗口图标与安装器品牌资源未回退到上游图形。

### 测试与文档

* 会话页头、工作区行菜单、Hero 品牌断言与桌面菜单 spec 按合并后的实现更新（页头 `renderFactorySlot`、行菜单 `contextMenu.button`、macOS Edit 子菜单与 Linux 隐藏菜单）。
* 5 组中英配对文档（`apps/desktop`、`apps/desktop/packaging`、`ui-conversation`、`ui-model-selection`、`ui-primitives`）合并正文后重算配对记录，`verify-translation-pairing` 校验通过。
* 新增 8 个 spec：`ui-sdkwork-capabilities` 的 rows/options/insertion、`ui-sdkwork-official-accounts` 的 host/modal/浏览器插件、`ui-sdkwork-knowledge` 的目录、`apps/desktop` 的参数解析；`ui-commands`、`ui-sdkwork-settings-menu`、`ui-sdkwork-sidebar`（子模块契约）与启动页 spec 按新实现更新。
