# SDKWork-Birdcoder2 自定义插件分析报告

> 分析对象：`E:\sdkwork-space\sdkwork-birdcoder2`（fork 自 `deepseek-ai/deepseek-harness`）
> 分析时间：2026-08-20
> 上游 remote：`upstream` → `https://github.com/deepseek-ai/deepseek-harness.git`
> 自有 remote：`origin` → `git@github.com:sdkwork-ai/sdkwork-birdcoder2.git`

---

## 一、命名规范（2026-08-20 全面改造后）

SDKWork 自定义插件统一以 **`sdkwork`** 标识，一眼可辨：

| 类别 | 目录前缀 | npm 包名 | cordis id |
|------|----------|----------|-----------|
| 客户端 UI 模式（17） | `packages/client/ui-sdkwork-*` | `@deepseek-ai/dsh-client-ui-sdkwork-*` | `ui-sdkwork-*` |
| 基础设施（2 改名） | `packages/host/sdkwork-*`、`packages/bundle/sdkwork-*` | `@deepseek-ai/dsh-sdkwork-*` | `sdkwork-*` |
| 基础设施（1 保持） | `packages/boot/sdkwork-env-bootstrap` | `@deepseek-ai/dsh-sdkwork-env-bootstrap` | 已带 `sdkwork-`，保持不变 |

> 改造范围：目录名 + npm 包名 + 全部 import/依赖 + cordis `id`/`name` + `tsconfig.base.json` 路径 + `pnpm-lock.yaml` 重新生成 + typecheck/build 回归。上游 `ui-theme`、`ui-sidebar` 等原生 `ui-*` 包**不在范围内**。

---

## 二、与上游的总体差异概览

- 分叉点（merge-base）：`141eb6fef83422698aef7a981029e843e8161534`（2026-08-19，上游 `dsh-0.1.0-rc.8`）。
- `upstream/master..main` 共有 124 个 SDKWork 侧提交；`packages/` 下 857 个文件变更，绝大多数为版本重钉/siblings pin 噪声。
- **真正的新增 = 20 个自定义插件**（改造后全部带 `sdkwork` 标识）。

---

## 三、自定义插件完整列表（20 个，改造后命名）

### A. 桌面基础设施 / 引导层（3 个）

| # | 包路径 | npm 包名 | 作用 |
|---|--------|----------|------|
| 1 | `packages/boot/sdkwork-env-bootstrap` | `@deepseek-ai/dsh-sdkwork-env-bootstrap` | SDKWork 启动环境引导：解析部署 profile、确保 bootstrap 令牌（复用 `@sdkwork/iam-credential-entry`）。`applySdkworkLaunchEnv` 与多环境网关常量。 |
| 2 | `packages/host/sdkwork-desktop-carrier` | `@deepseek-ai/dsh-sdkwork-desktop-carrier` | Electron 桌面载体：`app://` 协议替代 `node:http` 的 `webServer-service` 路由/回退/索引 taps 注册表。 |
| 3 | `packages/bundle/sdkwork-desktop-app` | `@deepseek-ai/dsh-sdkwork-desktop-app` | 桌面表层打包层：`dsh-base + dsh-web-app` 的 Electron patch 层（HTTP→桌面载体、RPC 走 IPC、零端口）+ 桌面表层 prompt 胶水。 |

### B. 客户端 UI 应用模式（17 个，均在 `packages/client/`）

| # | 包路径 | npm 包名 | 作用 |
|---|--------|----------|------|
| 4 | `packages/client/ui-sdkwork-app-modes` | `@deepseek-ai/dsh-client-ui-sdkwork-app-modes` | 模式栏（微信桌面版式）：Code/Work/Video/Image/AppStore 切换、非代码模式占位页、侧栏偏好。 |
| 5 | `packages/client/ui-sdkwork-appstore` | `@deepseek-ai/dsh-client-ui-sdkwork-appstore` | 应用商店模式，基于 SDKWork App Store PC 表层。 |
| 6 | `packages/client/ui-sdkwork-assets` | `@deepseek-ai/dsh-client-ui-sdkwork-assets` | 资产（Assets）模式：模式栏入口 + 占位页。 |
| 7 | `packages/client/ui-sdkwork-common-app-header` | `@deepseek-ai/dsh-client-ui-sdkwork-common-app-header` | 非代码模式共享应用头：标题栏、拖拽区、窗口控制占位。 |
| 8 | `packages/client/ui-sdkwork-course` | `@deepseek-ai/dsh-client-ui-sdkwork-course` | 课程模式，基于 SDKWork Course PC 表层。 |
| 9 | `packages/client/ui-sdkwork-drive` | `@deepseek-ai/dsh-client-ui-sdkwork-drive` | 云盘（Drive）模式，基于 SDKWork Drive PC 表层。 |
| 10 | `packages/client/ui-sdkwork-env` | `@deepseek-ai/dsh-client-ui-sdkwork-env` | 部署环境：ui-env 设置作用域（环境 + profile：网关、app id/key、token），共享 `ctx.env` 服务。 |
| 11 | `packages/client/ui-sdkwork-feedback` | `@deepseek-ai/dsh-client-ui-sdkwork-feedback` | 反馈集成：设置菜单反馈弹窗，提交到 `api.birdcoder.com` 反馈收集器。 |
| 12 | `packages/client/ui-sdkwork-generations-assets` | `@deepseek-ai/dsh-client-ui-sdkwork-generations-assets` | Agents 资产模式：keyed 模式栏入口 + 内嵌资产页。 |
| 13 | `packages/client/ui-sdkwork-generations-image` | `@deepseek-ai/dsh-client-ui-sdkwork-generations-image` | 图像生成模式：keyed 模式栏入口 + 内嵌创作页。 |
| 14 | `packages/client/ui-sdkwork-generations-video` | `@deepseek-ai/dsh-client-ui-sdkwork-generations-video` | 视频生成模式：keyed 模式栏入口 + 内嵌创作页。 |
| 15 | `packages/client/ui-sdkwork-iam` | `@deepseek-ai/dsh-client-ui-sdkwork-iam` | SDKWork IAM 集成：登录/注册（整页+弹窗）/登出，账号模式 + 设置菜单账号入口 + frame 弹窗宿主。 |
| 16 | `packages/client/ui-sdkwork-knowledge` | `@deepseek-ai/dsh-client-ui-sdkwork-knowledge` | 知识库模式，基于 SDKWork Knowledge Base PC 表层。 |
| 17 | `packages/client/ui-sdkwork-settings-menu` | `@deepseek-ai/dsh-client-ui-sdkwork-settings-menu` | 设置菜单（hover 浮层：账号、会员/积分、外观、帮助、更新、登出）+ 设置弹窗外壳。 |
| 18 | `packages/client/ui-sdkwork-token-plan` | `@deepseek-ai/dsh-client-ui-sdkwork-token-plan` | Token 套餐商务模式：会员套餐、Token 充值、优惠券核销。 |
| 19 | `packages/client/ui-sdkwork-updater` | `@deepseek-ai/dsh-client-ui-sdkwork-updater` | Electron 桌面壳更新发现 UI：更新横幅 + 更新偏好。 |
| 20 | `packages/client/ui-sdkwork-window-controls` | `@deepseek-ai/dsh-client-ui-sdkwork-window-controls` | 无边框 Electron 壳窗口控制：最小化/最大化/关闭簇。 |

---

## 四、改造执行记录（2026-08-20）

- `git mv` 重命名 19 个目录（17 UI + desktop-carrier + desktop-app）；`sdkwork-env-bootstrap` 保持。
- 全仓文本替换：旧完整 npm 包名 → 新包名、`ui-<name>` → `ui-sdkwork-<name>`、`desktop-*` → `sdkwork-desktop-*`（带边界 guard）。主仓 24 文件/371 处 + `.agents/notes` 53 文件/273 处。
- 文件级重命名 4 个：`desktop-app-glue.spec.ts`、`desktop-app.spec.ts`、`desktop-carrier.spec.ts` → `sdkwork-*`；`apps/web/tests/ui-iam.e2e.ts` → `ui-sdkwork-iam.e2e.ts`。
- `pnpm install --lockfile-only --offline` 重新生成 `pnpm-lock.yaml`；全量 `pnpm install --offline` 重链 node_modules（旧名零残留；`ui-sdkwork-iam` 新名 25 处入锁）。
- 回归：`pnpm run typecheck` 全绿；上游原生 `ui-*`（ui-theme/ui-sidebar 等）未触碰。

## 五、备注

- 已排除：12 个 `packages/typert/generator/tests/.typert-*` 测试夹具（非插件）。
- `extensions / goal / jobs / mcp / sandbox / schedule / session-query / spill / storage / workspace` 等在 rc.8 已属上游，不计入自定义。
- 兄弟仓库（`../sdkwork-iam`、`../sdkwork-utils` 等）无外部引用本批包名，`pnpm install` 不受影响。
