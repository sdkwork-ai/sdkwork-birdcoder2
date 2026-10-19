# BirdCoder 更新日志

本文件只记录**当前版本**——`##` 标题就是本次发布打的 tag，不累积历史版本条目；往期条目随各自版本的提交保留在 git 历史里（`git log -p CHANGELOG.md`）。「上游变更」逐字摘自上游该 release 的官方 Release notes（中文部分，英文版见各 Release 页面）；「BirdCoder 本地修改」记录 fork 在该版本上的自有变更（SDKWork 组件、品牌、打包与部署等），不受上游发布节奏影响。

## 0.2.1-rc.2（上游发布 2026-10-17，本地重打包 2026-10-20）

Fork 同步：merge 687f282e86（2026-10-17），13 个上游提交（窗口内含 `0.2.1-rc.1` 与 `0.2.1-rc.2` 两个 release 提交、cordis 4.0.5 等 9 个 vendor 包的依赖升级，以及本次真正进入代码的两项能力：DeepSeek-V4.1-Flash-1017 适配与 DeepSeek Search / Fetch API 双协议接入）。上游 Release：[v0.2.1-rc.2](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.1-rc.2)。本次是真实双亲合并提交（`git merge --no-ff`，非 squash / rebase / cherry-pick），上游 13 个提交的作者、日期与 commit message 原样进入历史；合并基线为上次同步的上游 tip `1517a4dbca`（2026-10-16），本窗口上游 tip 为 `687f282e86`。合并共 **5 个冲突，全部为 UU（双方都改）**，无 UD / DU / AA / AU / UA / DD；上游本窗口 **0 删除**（差量 465 文件、+4930 / −854，其中 2 个为新增包），fork 侧合并结果相对第一父也 **0 删除**，故无误删。`0.2.1-rc.1` 与 `0.2.1-rc.2` 由本次同一次合并提交带入（两个 tag 均为 HEAD 祖先），rc.1 的代码差量为零（纯版本提升），其官方 notes 的汇总项与本条目无差异，因此这里不重复叠加 rc.1 的条目。

### 上游变更

#### ✨ 新增功能

- 适配 DeepSeek-V4.1-Flash-1017 上线 @LegGasai
- 适配 DeepSeek Search 与 Fetch API，可在网页搜索设置中开启 @yudshj, @LegGasai

### BirdCoder 本地修改

本次同步覆盖上次 merge（`2bbf6d4858`）之后 fork 自有的改动，并逐项裁决本窗口的冲突与 fork 面保留。

#### 🔀 合并裁决与 fork 面保留

- `packages/client/ui-settings-web-search/README.md`、`README.zh.md`（本窗口唯二实质冲突）：上游重写了网页搜索设置页说明并新增「启用新版 Web 搜索 API」整段（开关默认关闭、开启后同时选择 DeepSeek Search 与 Fetch API、开关开启时以「每次搜索结果数」1–50 取代「单次请求最多搜索次数」、双协议各保留自己的 API 基础地址、一次保存先写提供方设置再写选择）。裁决为**整体采纳上游新增内容**，并把 fork 在 `ebec520337` 把凭据不可写的表述改为「提供方报告该凭据不可写入」（原上游写法为「例如由进程环境变量提供的密钥」）这一处措辞回填到上游新文本中——两侧各自成立，功能语义一致，故合并后保留 fork 表述而不丢弃上游新增段落。
- 三份 `.i18n.yaml` 配对记录（`docs/capability-seams.i18n.yaml`、`packages/client/README.i18n.yaml`、`packages/client/ui-settings-web-search/README.i18n.yaml`）冲突仅为内容哈希，取上游记录后由 `verify-translation-pairing --write` 按合并后的实际中英文正文重算，三对文档恢复 current。
- 品牌与安装面零改动：`FishLogo` 未新增任何调用点（仅 `ui-primitives` 内的定义、图标集注册与测试引用，`SubmenuMenu.tsx` 中出现的是注释），`BirdLogo` / `BirdWordmark` 的调用面（`ui-sidebar`、`ui-brand-official`、`ui-conversation`、`ui-sdkwork-app-modes`）全部保持 fork 版本，`Brand.tsx` 的官方名称槽仍 `return <BirdWordmark />`，`apps/web/public/favicon.png` 与 `website/public/favicon.png` 未变，上游 SVG 设计原稿、`wordmark.svg`、`favicon.svg` 维持删除不回流，`resolveWindowIcon(app.getAppPath())`、`brandIcon(` ×4、docs 导航 `dsh-mark`、`"productName": "BirdCoder"` 与 `apps/desktop/src/locale.ts` 的 25 处 BirdCoder 文案均照旧。
- SDKWork 自定义组件不受本次 merge 影响：合并结果相对第一父改动的 522 个文件中，**0 个**是 `sdkwork` 文件；`git ls-files` 中 sdkwork 路径 2093 个，合并前后完全一致，`packages/client/ui-sdkwork-*`、`packages/*/sdkwork-*`、`apps/sdkwork-birdcoder2-*`、Rust IAM bootstrap crate 与 `plugins/dsh-im` 子模块全部按 fork 版本原样保留。

#### 🔧 上游新包的接线完整性

上游新增两个包，已确认在 fork 的合并结果里全部接入、无遗漏：

- `packages/web/web-deepseek-api`（`@deepseek-ai/dsh-web-deepseek-api`）：进入 `tsconfig.base.json` 路径别名与 `tsconfig.host.json` project reference；`packages/bundle/base/cordis.patch.yml` 新增 `web-deepseek-api` 行（与 `web-search-deepseek` 并列，同为 `apiKeyEnv: DEEPSEEK_API_KEY`）；`pnpm-lock.yaml` 新增其 importer 块。
- `packages/client/ui-deepseek-model-label-1017`（`@deepseek-ai/dsh-client-ui-deepseek-model-label-1017`）：进入 `tsconfig.base.json` 别名与 `tsconfig.client.json` reference，其 `tsconfig.json` 引用 `../locale/tsconfig.client.json`（与 fork 拆面约定一致，不会触发 `TS6306`）；`packages/bundle/web-app/cordis.patch.yml` 新增该行，fork 桌面端 `packages/bundle/sdkwork-desktop-app` 正是「dsh-base + dsh-web-app」之上的 Electron 层，故 1017 徽标自动进入桌面端组合。
- `pnpm-lock.yaml`：git 自动合并后由 pnpm 语义完整保留，合并结果为 **603 → 605 个 importer**（0 丢失、恰好新增上述 2 个），236 个 sdkwork importer 全在，既无 fork 包丢失 importer，也无上游依赖解析被回退。

#### 📦 版本收敛

- 57 个 fork 自有成员（`ui-sdkwork-*`、`sdkwork-*` 及 fork 维护的同名上游包）由 `0.2.1-alpha.5` 对齐到上游的 `0.2.1-rc.2`，只移动清单顶层 `version` 行、不触碰任何依赖区间（57 增 57 删，非 version 行的差异为 0），与上游的 `0.2.1-rc.2` 家族保持一致。

#### 🏷️ OEM 部署配置（重打包新增）

- 新增 `packages/host/sdkwork-oem`（`@deepseek-ai/dsh-sdkwork-oem`）：启动时解析 `$DSH_HOME/oem.json`（可用 `DSH_OEM_CONFIG` 覆盖）并发布 `ctx.oem`；`packages/bundle/base/cordis.patch.yml` 的 `deepseek-account`、`llm-deepseek-account`、`web-search-deepseek`、`web-deepseek-api` 四行改经 `inject: [oem]` 读取登录/推理域名与接口基址，登录流程（PKCE、回调路径、请求头、授权存储）保持官方实现。出厂默认指向 `platform.birdcoder.com` / `api.birdcoder.com`，无配置文件时行为不变；官方 `platformOrigin` 与部署 `inferenceOrigin` 的越权组合会被拒绝。
- 新增 `packages/client/ui-sdkwork-oem`（`@deepseek-ai/dsh-client-ui-sdkwork-oem`）：把 Host 注入的 `__DSH_OEM__` 品牌写入 `LocaleRuntime.setBrand` 与 `document.title`；`BirdWordmark`、桌面 About 面板、欢迎窗口与 API Key 面板统一使用该品牌。安装器文案与 productName 等构建期身份仍由发布车道决定，不进入运行时配置。
- 托管部署用自己的域名完成登录回调：`deepseek-account-platform` 新增 `applicationOrigins` 与 `loginOrigin(origin, applicationOrigins)`，只接受配置过的 HTTPS 回调源，回环回调保留给 Desktop 与本地开发。
- OEM 配置同时携带 `sdkwork.iamBaseUrl`，覆盖 `ui-sdkwork-env` 的 IAM app-api 源；`ui-sdkwork-iam` 在非默认值时逐层生效，生成的 `/app/v3/api/auth/...` 路径与 `X-Platform: pc` 请求头不变。
- 文档同步：`AGENTS.md` 新增 OEM 合并契约，`docs/subsystems/boot.md`、`docs/module-graph.md`、Cordis API/catalog 生成物与两个新包的 README（含中英配对）一并更新。

#### 🔐 桌面端 IAM 浏览器登录（重打包新增）

- `apps/desktop/src/iam-deep-links.ts` 注册 `sdkwork-birdcoder://auth/callback` 协议，统一处理 macOS `open-url` 与 Windows/Linux 第二实例 argv，并通过 `sdkwork:deepLinks:*` / `sdkwork:shellOpen:*` 白名单 IPC 暴露给渲染进程；`iam-preload.ts` 在 `window.sdkworkDesktop` 下提供与 `@sdkwork/iam-desktop-auth` 一致的桥接形状。
- `ui-sdkwork-iam` 新增 `iam-desktop.ts`：校验页面桥接后，经 `@sdkwork/iam-desktop-auth` 发起 PKCE 浏览器登录，并用生成 SDK 的 `oauth.desktopSessions.create` 兑换双令牌会话；`SignInOverlay` / `AccountModePage` 增加桌面浏览器登录入口。
- `apps/desktop` 新增 `@deepseek-ai/dsh-sdkwork-oem` 运行时依赖与 `iam-preload` 接线；桌面主进程在 OEM 配置损坏时仍以出厂品牌渲染致命错误对话框。

#### 🐞 稳定性修复

- `ui-sdkwork-iam` 恢复已持久化会话时，姓名拆分正则由 `/s+/` 修正为 `/\s+/`，并改用 `charAt` 生成首字母，避免把姓名中的字母吞掉。
- `ui-sdkwork-settings-menu` 的 `AccountRuntime` 在账号源切换时解绑旧订阅、把现有监听器迁移到新源并立即通知，避免功能插件热重载后菜单停留在已销毁的服务上。
- `ui-settings-models` 的 `ProviderEditor` 在无可见凭据引用时显式返回 `undefined` 的 key hint，修正类型收窄。
- Linux 运行时：平台策略只对 win/mac 生效（Linux 不再因 `dshMandatoryUpdatePolicy` 中止启动），Electron Host 在 Linux 下拒绝 `sharp` 预编译包、改用随包 Node 运行时处理图片，避免首个解码调用杀死 Host。

#### 📦 依赖与子模块

- `scripts/sdkwork-sources.manifest.json` 与 `sdkwork.workflow.json` 将 `sdkwork-iam` 从 `5b1aa45` 推进到 `ec41455`（补齐桌面登录弹窗对 `desktopBrowserLogin` 的转发），37 个 SDKWork sibling pin 与本地工作区一致，`pnpm install --frozen-lockfile` 与 `verify-sdkwork-dependencies` 通过。
- `plugins/dsh-im` 子模块从 v4.38.0 推进到 `2f51dcb`（v5.1.0 之后的 main tip，适配 0.2.1-rc.2，新增群消息归档与群历史工具）。
- 30 个漂移的 sibling pin 已按 `2661c25f` 重新对齐；本仓库继续使用 `../sdkwork-*` 相对路径开发，CI/发布按 manifest 的 Git 仓库与完整 SHA 克隆，发布时 `package.json` 不做改写。
