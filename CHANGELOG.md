# BirdCoder 更新日志

本文件只记录**当前版本**——`##` 标题就是本次发布打的 tag，不累积历史版本条目；往期条目随各自版本的提交保留在 git 历史里（`git log -p CHANGELOG.md`）。「上游变更」逐字摘自上游该 release 的官方 Release notes（中文部分，英文版见各 Release 页面）；「BirdCoder 本地修改」记录 fork 在该版本上的自有变更（SDKWork 组件、品牌、打包与部署等），不受上游发布节奏影响。

## 0.2.2-alpha.5（fork 发布 2026-11-03）

本版本打在 `birdcoder-v0.2.2-alpha.4`（`5695690194`）之后，无上游同步窗口：包含该 tag 之后到本 tag 前的全部 fork 自有变更——cloud 部署档位与浏览器 runtime env 标准、发布包内置部署凭据、桌面发布逐目标 lane、默认内置插件市场、客户端账号切换与页面导航修复，以及打包 lane 下载缓存目录与发布契约的修复。

### BirdCoder 本地修改

#### 功能

* **桌面发布改为逐目标 lane**：`desktop-release.yml` 保留唯一的六目标表，每个目标成为独立 job（`package-win-x64` 到 `package-linux-arm64`）并调用新的可复用 workflow `desktop-package-target.yml`。失败时运行摘要与 Actions API 直接指明目标，"re-run failed jobs" 只重试该目标；`resolve` 校验 `targets` 子集并按发布顺序归一，部分运行仅用于重新打包与诊断。各 lane 复用 runner 临时目录下载缓存（Electron、随包 Node/pnpm/Python 负载），Windows 短构建根保持不变；`scripts/desktop-release-workflow.spec.ts` 把六目标表、runner、构建根、平台设置文件、打包脚本与产物名钉在 `desktop-build-paths.mjs` 和发布汇总器上。
* **插件市场默认随应用出货**：Web 组合 `packages/bundle/web-app` 以 npm 依赖 `dshmarket ^1.73.8` 钉住已发布构建产物，并在自己的 `cordis.patch.yml` 挂载 `dsh-market` 行，桌面组合直接继承。出货的 Web 或桌面构建打开插件页即落在可浏览的社区目录，无需安装步骤；`built-in-plugin-market.spec.ts` 断言挂载行、两半边产物与 `market` 控制服务契约。
* **cloud 部署档位成为默认**：新增 `.env.cloud.{development,test,production}`，取值对齐 `etc/topology/cloud.<environment>.env`（production 为 `https://api.sdkwork.com`，应用入口按域名访问）；`apps/web/vite.config.ts` 默认 `cloud`，非 development 构建丢弃 loopback 地址；桌面发布 lane 显式声明 `DSH_WEB_DEPLOYMENT_PROFILE=cloud`。
* **标准 env 物化流程**：仓库根 `workflow:materialize-client-env` 改调 sdkwork-specs 标准物化器，`check:client-env` 校验 50 个已提交面；新增 `sdkwork-birdcoder2-pad` 面；pad、Flutter 与小程序构建默认 cloud，standalone 保留为显式变体。
* **容器 Compose 直接读取部署的 per-environment topology env**：`docker-compose.yml` 不再依赖打包期投影。
* **创意应用跟随账号重建**：图像/视频创作面的 Host 适配器按账号标识（tenant、organization、user）生成 `surfaceRevision`，账号切换时重建内嵌视图，同账号令牌刷新与语言切换不重建。
* **模板库与需求大厅重新打开回到首页**：两个 Host 适配器新增 `navigationResetKey` 与 `resetNavigation()`，侧边栏每次点击都把内嵌路由重置到页面根；需求提交支持多应用形态 `appForms`。
* **技能设置入口区分**：设置侧栏的 `skills` 行使用技能图标，文案改为「技能设置」/「Skill settings」，避免与技能市场行混淆。

#### 修复

* **安装包的 IAM 登录**（`bb2014454b`）：打包清单把应用编码写入 `resources/sdkwork-app.json`，外壳在启动 Host 前解析并经 `SDKWORK_APPLICATION_CODE` 传入，凭据包按应用编码而非 profile 目录名定位，修复 GitHub 构建的安装包报 `access-token-only request requires Access-Token before request dispatch`。
* **发布包自带部署凭据**（`388efed45d`、`e629acd53f`）：受跟踪的 `.env.standalone.production` 携带本部署的 `SDKWORK_ACCESS_TOKEN`，发布车道改为 `deployment` 类别；令牌过期或 claims 不匹配时构建 fail closed，轮换方式为吊销旧值、刷新该文件并重新打包。
* **浏览器 runtime env 标准门禁**（`5b4483e55d`）：仓库根链接 `@sdkwork/sdk-common`，`check-browser-runtime-env-standard` 输出 `standard ok`。
* **构建模式按车道选择**（`7d2869486a`）：dev/online 各自烘焙对应环境，启动进程自身的 `SDKWORK_*` 在 `loadEnv` 前移除，避免已安装应用的环境污染源码构建。
* **SDKWork 配置改由 Vite env 文件在构建期注入**（`c98f6b8234`）：删除打包期投影、`resources/sdkwork-release.env` 与 `resources/sdkwork-app.json` 之外的外壳投影管线，环境由构建模式选择，一环境一构建。

#### 依赖与版本

* 新增 npm 依赖 `dshmarket@1.73.8`（Web 组合与 client-runtime 测试支撑），其运行时闭包带入 `undici` 与 `js-yaml`；锁文件已同步，`pnpm install --frozen-lockfile` 通过。
* submodule 前进到各自跟踪分支的最新 pin：`plugins/dsh-im` `dd500d24` → `d2f2703d`（v5.9.1 之后的模型目录错误保留与保存失败提示，`lib/` 已重建）、`plugins/dsh-mcp-connector` `0aaf140` → `80f6182`（v0.2.93 专家数据市场，`lib/` 与 `ui/` 随提交出货）；`plugins/dsh-better-sidebar` dev `bd6cfa5`、`plugins/dsh-skill-market` `4cda930`（v2.0.7）维持不动。
* SDKWork 发布车道依赖维持 `scripts/sdkwork-sources.manifest.json` 与 `agent.workflow.json` 的双记录 pin：本地走相对路径工作区，发布按 pin 克隆 git 仓库；本版本未前进 pin。
* 版本号同步推进到 `0.2.2-alpha.5`（450 个 released manifest，`verify-version-sync` 通过）。
