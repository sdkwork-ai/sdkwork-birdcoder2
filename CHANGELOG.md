# BirdCoder 更新日志

本文件只记录**当前版本**——`##` 标题就是本次发布打的 tag，不累积历史版本条目；往期条目随各自版本的提交保留在 git 历史里（`git log -p CHANGELOG.md`）。「上游变更」逐字摘自上游该 release 的官方 Release notes（中文部分，英文版见各 Release 页面）；上游尚未发布 Release notes 时，按该 tag 内的实际提交归纳并注明来源。「BirdCoder 本地修改」记录 fork 在该版本上的自有变更（SDKWork 组件、品牌、打包与部署等），不受上游发布节奏影响。

## 0.2.2-rc.2（fork 发布 2026-11-08）

本版本不含上游合并：它把 `birdcoder-v0.2.2-rc.1` 之后落在 `main` 上的全部改动（域名与证书设置插件、小程序账号设置、Markets 云目录优先、IAM 登录链路的三个修复）一并发布，并把仓库内置的三个插件推进到各自的最新发布提交。发布资产与 rc.1 同构：六个平台（win-x64、win-arm64、mac-x64、mac-arm64、linux-x64、linux-arm64）桌面安装包、两套原生容器镜像、以及 Compose/Kubernetes 部署包，共 31 个附件。

### 新增功能

* 设置菜单新增**域名管理**（`ui-sdkwork-dns`）与**证书管理**（`ui-sdkwork-certificate`）两个独立插件，落在「公众号账号」「小程序账号」之下。两者各自持有设置行、80vw 弹窗框架、工作区、语言命名空间与 Host 适配器，能力本身取部署应用 API 的 `domain.domainZones` 与 `certificate` 表面，不引入第二套后端契约，也不互相依赖；设置菜单只通过 `settings.dns` / `settings.certificates` 两个根级 feature-modal 座位授予可见性。
* 设置菜单新增**小程序账号**设置插件。
* 部署目标选择更精确：桌面宿主的环境启动参数区分部署档位，未显式指定时回落到既有行为。
* Markets 四个分类（插件、技能、专家、连接器）统一改为**先展示 SDKWork 云目录**并默认选中，连接器分类首次也有云目录货架；此前插件分类以社区市场打头、技能分类云目录排第二的次序被本版本推翻。
* Markets 改用 `iam:self` 应用令牌访问云目录，会话与令牌在每次读取前镜像到浏览器全局令牌管理器。
* 侧栏代码入口改用 home 图标，令牌套餐等 rail 入口的图标与文案同步收敛。

### 问题修复

* **登录弹层可操作**：Radix 对话框会给 `body` 加 `pointer-events: none`、给兄弟节点加 `aria-hidden`，因此从 Token Bank 充值弹窗上浮起的登录卡「画得出来却点不动」。登录宿主现在为自己的子树恢复 `pointer-events`、清掉 `aria-hidden`，并独占顶层槽位（z-index 1200），压在页面模态、商城对话框、菜单与 toast 之上。
* **桌面深链登录的一次性授权码最多兑换一次**：生成的传输层遇到传输失败、超时、5xx 与 429 会重试三次，而这些恰恰是服务端可能已经消费掉授权码的情形，重试只能换回「OAuth authorization code is invalid or expired」并把浏览器已完成的登录报成失败。兑换改为不重试，同一授权码的重复投递（并发或渲染进程晚加载）只兑换一次；本地等待窗口由十分钟收紧到与服务端一致的授权状态窗口，失败原因此前只留在错误对象里、现在会呈现给用户。
* **支付与兑换就地拉起登录**：未登录时的支付、兑换不再先打网关再回显 bearer-token 错误，也不再弹出桌面欢迎页盖住工作区。两处用户发起的商城变更改由 `requestSignInInPlace` / `requireSignedInInPlace` 守护：登录浮层就地打开在当前对话框之上，登录后同一个请求继续；关闭浮层给出本地化的 `commerce.signInRequired` 提示。
* **令牌套餐档位表深色模式悬停可读**：嵌入的 Tailwind 样式表重新声明了浅色 hover 工具类，导致深色表面上整行变成近白色、深色文字不可读。深色变体恢复为预期的半透明深色填充，与分组表头的覆盖保持一致。

### 插件与依赖

* `dsh-better-sidebar` 前进到 **v0.30.1**：支持 DSH 0.2.2，侧聊支持图片，引用块可点击跳转，编辑器草稿本地备份。
* `dsh-mcp-connector` 前进到 **v0.2.95**：连接器设置拥有独立入口。
* `dsh-im` 保持 **v5.10.0**（`origin/main` 上的提交尚未发布，其 `lib/` 产物与本仓库「按发布产物运行」的 pin 契约不符）；`dsh-skill-market` 保持 **v2.0.7**。
* 四个插件 submodule 的 pin 一律落在发布提交上，插件依赖清单无变化，因此 `pnpm-lock.yaml` 不发生改动。

### 打包与发布

* 版本号 0.2.2-rc.1 → **0.2.2-rc.2**（`pnpm run release:dsh 0.2.2-rc.2`），`package.json` 与 tag `birdcoder-v0.2.2-rc.2` 一致。
* 依赖解析规则不变：本地开发走 `pnpm-workspace.yaml` 的相对路径 / `workspace:` 协议，发布产物走 git 仓库与 registry 依赖；SDKWork 生态兄弟仓库仍按 `scripts/sdkwork-sources.manifest.json` 的 pin 检出。
