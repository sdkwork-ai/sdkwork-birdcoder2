# BirdCoder 更新日志

本文件只记录**当前版本**——`##` 标题就是本次发布打的 tag，不累积历史版本条目；往期条目随各自版本的提交保留在 git 历史里（`git log -p CHANGELOG.md`）。「上游变更」逐字摘自上游该 release 的官方 Release notes（中文部分，英文版见各 Release 页面）；上游尚未发布 Release notes 时，按该 tag 内的实际提交归纳并注明来源。「BirdCoder 本地修改」记录 fork 在该版本上的自有变更（SDKWork 组件、品牌、打包与部署等），不受上游发布节奏影响。

## 0.2.2-rc.1（fork 发布 2026-11-05，2026-11-09 重新打包）

本次是 `0.2.2-rc.1` 的重新打包，不是新的版本线：内置插件在 `devDependencies` 里把 `@deepseek-ai/dsh-*` 钉在精确的 `0.2.2-rc.1`，插件的开发依赖因此要求发布版本必须仍是 rc.1（换成 rc.2 会让冻结安装的 lockfile 校验直接失败）。相对 2026-11-05 首次发布的 rc.1，本次累计带上 `main` 上在其后落地的全部改动：域名与证书设置插件、小程序账号设置、Markets 云目录优先、IAM 登录链路的三个修复、内置插件推进到各自的最新发布提交，以及助理 surface 的一组功能与修复（见下）。SDKWork 生态兄弟仓库的 31 个依赖 pin 同步推进到各自已推送的 `origin/main`（`scripts/sdkwork-sources.manifest.json` 与 `agent.workflow.json` 双记录保持一致）。发布资产与首次 rc.1 同构：六个平台（win-x64、win-arm64、mac-x64、mac-arm64、linux-x64、linux-arm64）桌面安装包、两套原生容器镜像、以及 Compose/Kubernetes 部署包，共 31 个附件。

### 新增功能

* 新增**助理（assistant）surface**：助理 rail 入口接回侧栏且图标随选中态填充；会话内模型选择器改由工厂渲染，复用 Home 的模型分组与会话目录读取，并在刷新时保持复用的选择器不关闭；抽屉式资源面板统一替换为模态对话框。
* 设置菜单新增**域名管理**（`ui-sdkwork-dns`）与**证书管理**（`ui-sdkwork-certificate`）两个独立插件，落在「公众号账号」「小程序账号」之下。两者各自持有设置行、80vw 弹窗框架、工作区、语言命名空间与 Host 适配器，能力本身取部署应用 API 的 `domain.domainZones` 与 `certificate` 表面，不引入第二套后端契约，也不互相依赖；设置菜单只通过 `settings.dns` / `settings.certificates` 两个根级 feature-modal 座位授予可见性。
* 设置菜单新增**小程序账号**设置插件。
* 部署目标选择更精确：桌面宿主的环境启动参数区分部署档位，未显式指定时回落到既有行为。
* Markets 四个分类（插件、技能、专家、连接器）统一改为**先展示 SDKWork 云目录**并默认选中，连接器分类首次也有云目录货架；此前插件分类以社区市场打头、技能分类云目录排第二的次序被本版本推翻。
* Markets 改用 `iam:self` 应用令牌访问云目录，会话与令牌在每次读取前镜像到浏览器全局令牌管理器。
* 侧栏代码入口改用 home 图标，令牌套餐等 rail 入口的图标与文案同步收敛。
* 内置**用量与计费仪表盘**（`dsh-ui-usage-billing`）：侧栏费用卡与八分区仪表盘，供应商余额、订阅与中转站额度，低谷任务队列和 CSV/JSON 导出；用量取自持久化会话日志的真实聚合，价格取自实时目录（含 DeepSeek 峰谷分时价），宿主侧以同源 `/api/billing/*` 路由提供数据，模型侧 `usage_stats` 工具默认关闭。插件以 `plugins/dsh-ui-usage-billing` 子模块接入并在 Web 组合里默认挂载，无需安装步骤。
* 用量卡的入口移到**设置菜单用户名下方**：侧栏费用卡默认**完全隐藏**，打开左下角设置齿轮即可在用户名下面看到今日花费（今日/本周/本月主数字、涨跌徽章、近 7 天迷你柱），点击打开完整仪表盘；已存偏好不改写，插件设置页仍可恢复侧栏卡面。实现走宿主的 `settings.menu.account` 座位（`ui-settings` 声明、`ui-sdkwork-settings-menu` 渲染在账户身份行下方），插件注册卡面并读侧栏实例发布的同一份快照，两处金额与失败态永远一致。子模块同时切换到 SDKWork 自有 fork `sdkwork-ai/sdkwork-dsh-usage-billing`（包名与 loader 行 id 不变），此后该插件的源码与构建产物由本 fork 维护。

* 设置中心新增**「输入框底部内容」**配置：输入框底部的两枚常驻胶囊——**低谷队列**（入口与入队控件）与**价格**（当前会话即时费用，含平价/峰谷）——**默认都不显示**；设置页第一组、导航第一项即可按需打开，价格开关打开后才展开位置选择（输入框内部 / 上方 / 下方）。读取改为 opt-in（只有显式 `true` 才显示），并对存量偏好执行一次性迁移（`dsh.ui-usage-billing.composer-footer-hidden`）：旧版本把当时默认的 `show/showEntry=true` 固化进 localStorage，升级后首次加载会把这两个显示开关关一次，其它偏好字段保留；之后用户手动打开照常生效。侧栏卡的偏好读取同口径收紧：没有 `mode` 字段的旧偏好按隐藏处理，只有显式 full/compact 才显示。

### 问题修复

* **登录弹层可操作**：Radix 对话框会给 `body` 加 `pointer-events: none`、给兄弟节点加 `aria-hidden`，因此从 Token Bank 充值弹窗上浮起的登录卡「画得出来却点不动」。登录宿主现在为自己的子树恢复 `pointer-events`、清掉 `aria-hidden`，并独占顶层槽位（z-index 1200），压在页面模态、商城对话框、菜单与 toast 之上。
* **桌面深链登录的一次性授权码最多兑换一次**：生成的传输层遇到传输失败、超时、5xx 与 429 会重试三次，而这些恰恰是服务端可能已经消费掉授权码的情形，重试只能换回「OAuth authorization code is invalid or expired」并把浏览器已完成的登录报成失败。兑换改为不重试，同一授权码的重复投递（并发或渲染进程晚加载）只兑换一次；本地等待窗口由十分钟收紧到与服务端一致的授权状态窗口，失败原因此前只留在错误对象里、现在会呈现给用户。
* **支付与兑换就地拉起登录**：未登录时的支付、兑换不再先打网关再回显 bearer-token 错误，也不再弹出桌面欢迎页盖住工作区。两处用户发起的商城变更改由 `requestSignInInPlace` / `requireSignedInInPlace` 守护：登录浮层就地打开在当前对话框之上，登录后同一个请求继续；关闭浮层给出本地化的 `commerce.signInRequired` 提示。
* **令牌套餐档位表深色模式悬停可读**：嵌入的 Tailwind 样式表重新声明了浅色 hover 工具类，导致深色表面上整行变成近白色、深色文字不可读。深色变体恢复为预期的半透明深色填充，与分组表头的覆盖保持一致。

### 插件与依赖

* `dsh-better-sidebar` 前进到 **v0.30.1**：支持 DSH 0.2.2，侧聊支持图片，引用块可点击跳转，编辑器草稿本地备份。
* `dsh-mcp-connector` 前进到 **v0.2.95**：连接器设置拥有独立入口。
* `dsh-skill-market` 前进到 **v2.1.0**：插件获得自己的设置页，`lib/` 产物在功能提交内同批重建，符合「按发布产物运行」的 pin 契约。
* `dsh-better-sidebar` 前进到 v0.30.1 之后的文档提交（AGENTS.md 重构，源码与 `lib/` 产物不变）。
* `dsh-im` 保持 **v5.10.0**（`origin/main` 上的提交尚未发布，其 `lib/` 产物与本仓库「按发布产物运行」的 pin 契约不符）。
* 新增内置插件 `dsh-ui-usage-billing`，子模块改指 SDKWork 自有 fork `sdkwork-ai/sdkwork-dsh-usage-billing`，pin 落在 **`1.8.4-sdkwork.3`**（`9cba33d`，基线 `v1.8.3-alpha.4`）；其 `lib/` 产物与源码在同一次提交内重建，符合「按发布产物运行」的 pin 契约。包名 `@kenz1117/dsh-ui-usage-billing` 与 loader 行 id `ui-usage-billing` 保持不变，上游署名与版权保留。
* `dsh-ui-usage-billing` 同时是 workspace 成员，自带开发者依赖闭包，因此本次 **`pnpm-lock.yaml` 随插件 pin 一起刷新**；其余四个插件的 pin 与依赖清单不变。
* SDKWork 生态兄弟仓库的 31 个 pin 推进到各自已推送的 `origin/main`（`scripts/sdkwork-sources.manifest.json` 与 `agent.workflow.json` 双记录同步）。

### 打包与发布

* 版本号保持 **0.2.2-rc.1**（`package.json` 与 tag `birdcoder-v0.2.2-rc.1` 一致）；tag 改指本次构建的提交，发布 workflow 会删除该 tag 的既有 Release 并按同一份 31 个资产重建。
* 依赖解析规则不变：本地开发走 `pnpm-workspace.yaml` 的相对路径 / `workspace:` 协议，发布产物走 git 仓库与 registry 依赖；SDKWork 生态兄弟仓库仍按 `scripts/sdkwork-sources.manifest.json` 的 pin 检出。
