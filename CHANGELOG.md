# BirdCoder 更新日志

本文件只记录**当前版本**——`##` 标题就是本次发布打的 tag，不累积历史版本条目；往期条目随各自版本的提交保留在 git 历史里（`git log -p CHANGELOG.md`）。「上游变更」逐字摘自上游该 release 的官方 Release notes（中文部分，英文版见各 Release 页面）；上游尚未发布 Release notes 时，按该 tag 内的实际提交归纳并注明来源。「BirdCoder 本地修改」记录 fork 在该版本上的自有变更（SDKWork 组件、品牌、打包与部署等），不受上游发布节奏影响。

## 0.2.2-rc.1（fork 发布 2026-11-04）

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

### 校验

* 上游改过、fork 未改的 1196 个文件与 `upstream/master` 逐字节一致（0 失配），即上游改动全部落地、没有被 fork 侧覆盖。
* 上游本轮删除的 3 个模块（`session-reveal`、`useAnchoredPosition`、`HeaderAction`）在源码中已无引用，随上游一并移除。
* fork 自有文件 3309 → 3300，差额即上述 9 个上游重构删除的文件（含对应测试），无其他 fork 文件丢失。
* 品牌契约逐项复验：`FishLogo` 仅存于 ui-primitives，`BirdLogo`/`BirdWordmark`/`LoginPanel` 均落在 fork 自有表面，窗口图标与安装器品牌资源未回退到上游图形。

### 测试与文档

* 会话页头、工作区行菜单、Hero 品牌断言与桌面菜单 spec 按合并后的实现更新（页头 `renderFactorySlot`、行菜单 `contextMenu.button`、macOS Edit 子菜单与 Linux 隐藏菜单）。
* 5 组中英配对文档（`apps/desktop`、`apps/desktop/packaging`、`ui-conversation`、`ui-model-selection`、`ui-primitives`）合并正文后重算配对记录，`verify-translation-pairing` 校验通过。
