# Agent Note：SDKWork 配置来自 Vite env 文件

Status: implemented

[English](2026-11-02-vite-env-configuration.md) | 中文

## 问题

安装后的桌面应用在没有任何引导凭据的机器上无法访问 SDKWork 网关：客户端从打包生成的 `resources/sdkwork-release.env` 产物得知部署、网关与 `SDKWORK_ACCESS_TOKEN`，外壳把它交给 Host，Host 再以 `__DSH_SDKWORK_ENV__` 投影进页面。这条链有三项持续代价：产物必须由打包专用步骤（`prepare:sdkwork-env`）与分发类别（`DSH_DESKTOP_DISTRIBUTION`）决定是否允许携带凭据；投影是第二条可能与已提交 env 文件不一致的配置路径；GitHub 车道无法使用仓库自己提交的 env 文件，只能产出无法派发 IAM credential-entry 请求的 `public` 产物。

## 决策

### 受跟踪的 env 文件是唯一环境来源

`apps/web/vite.config.ts` 用 Vite 的 `loadEnv` 读取 `.env` 与 `.env.<deployment-profile>.<environment>`，经 `projectSdkworkEnvBase` 映射 SDKWork 键，并把得到的 `__DSH_SDKWORK_ENV__` 注入构建出的 HTML。`DSH_WEB_DEPLOYMENT_PROFILE` 选择 `cloud`（默认）或 `standalone`，构建模式选择 `development|test|staging|production`（`--mode`，或由自行驱动构建的车道设置的 `DSH_WEB_BUILD_MODE`）；每个受跟踪 env 文件都可以携带本部署的 `SDKWORK_ACCESS_TOKEN`。启动进程自身的 `SDKWORK_*` 在加载前会被移除，因此从集成 shell 启动的已安装应用无法决定源码构建烘焙什么；由 launcher 自行解析的值（`desktop:dev --gateway`）通过显式的 `DSH_WEB_SDKWORK_*` 通道传入。

### 默认 cloud，且按域名访问

cloud 档位与 `etc/topology/cloud.<environment>.env` 一致：平台 API 网关与 IM 网关都是 SDKWork 云边缘（production 为 `https://api.sdkwork.com`，其余为 `api-<tier>.sdkwork.com`），应用公网入口是 `https://harness<suffix>.sdkwork.com`。`.env.cloud.production` 携带与 `.env.standalone.production` 相同的引导凭据，因此安装后的应用按 cloud 部署认证。非 development 构建会丢弃各面 URL 中的 loopback 地址，避免打包机的本地 `.env` 把 `127.0.0.1` 烘焙进必须访问部署域名的产物。

### 页面是唯一载体

Host 不再发布任何东西：`packages/client/ui-sdkwork-env` 保留设置段与 schema，浏览器把注入的页面全局与用户设置文档合并。用户文档仍逐字段优先，部署无需重建即可覆盖，但不再有运行期投影、不再依赖启动环境快照，也不存在指向另一网关的第二来源。

### 打包不再包含 SDKWork 步骤

`package-target.ts` 不再运行 `prepare:sdkwork-env`、不再断言分发类别，也不再携带 `resources/sdkwork-release.env` 或 `resources/sdkwork-app.json`。打包原本就会执行的 Web 构建（`vite build`，production 模式）把受跟踪 env 文件烘焙进页面，产物因此无需打包期的凭据决策即自足。分发类别门禁、发布环境产物、应用身份资源及其外壳/Host 管线一并删除。

### 一个环境一次构建

一次构建只针对一个部署与环境。`pnpm --filter @deepseek-ai/dsh-web-frontend run build:test` / `build:staging` / `build:production` 选择环境，`dev:web` 的 watcher 构建 `development`，GitHub 发布车道构建 `production`（默认读取 `.env.cloud.production`）。切换安装后的环境意味着安装对应的构建；运行期切换曾是投影的职责，这里按设计移除。

### 刷新凭据就是一次提交

可用的 `SDKWORK_ACCESS_TOKEN` 位于受跟踪的 `.env.cloud.production`（以及对应的 standalone 文件，见两者文件头）。`pnpm env:token:ensure --environment production` 把值物化进用户私有凭据包；把它复制进受跟踪文件、提交并重跑车道，就刷新了今后每次构建烘焙的值。构建前仍由 `pnpm env:token:resolve` 校验该值，缺失或过期会提前失败并给出修复命令。

## 备选方案

**保留运行期投影。** 它让一个构建服务多个环境与本机凭据，也正是安装产物在缺少该机器状态时失败的原因。页面在运行期读不到 env 文件，所以每个部署最终都要让投影与已提交文件保持一致；两个来源，共享同一个故障。

**保留部署产物，但允许它覆盖烘焙值。** 又是两个来源，而且打包产物会与开发者审阅过的 env 文件悄悄不一致。删除该产物后，刷新凭据的那次 diff 是值发生变化的唯一位置。

**GitHub 车道改用仓库 secret。** 车道会产出没有文件记录的配置，本地构建仍需要另一套机制。受跟踪的 env 文件在刷新它的同一次 diff 中可审阅。

**保留通用构建，在启动时获取配置。** 那只是投影的另一个名字，IAM credential-entry 的失败模式不变：首个请求之前没有令牌。

## 结果

每个产物只命名一个部署，且无需任何本机准备即可认证。凭据成为构建页面的一部分，暴露面等同已提交的 env 文件；轮换意味着吊销令牌、刷新受跟踪值、提交并重建。`ui-sdkwork-env` 设置文档仍供本地覆盖，但安装后的应用不再能在不换装另一个构建的情况下切换环境。`dev:web` 现在烘焙 development 的 env 文件，开发者若需要在开发期使用引导令牌，应写入 `.env`（被 Git 忽略）或 `.env.standalone.development`。

## 验证

`pnpm exec vitest run packages/client/ui-sdkwork-env/tests apps/desktop/tests/package-target-stages.spec.ts apps/desktop/tests/desktop-package-environment.spec.ts` 覆盖设置段、Host 不再发布启动环境投影，以及不再包含 SDKWork 步骤的打包阶段列表。`pnpm --filter @deepseek-ai/dsh-web-frontend run build` 产出的 `dist/index.html` 中 `__DSH_SDKWORK_ENV__` 带有 `environment: production`、`apiBaseUrl: https://api.sdkwork.com`、`imApiBaseUrl: https://api.sdkwork.com` 与已提交令牌，且没有任何 loopback 面地址；`DSH_WEB_DEPLOYMENT_PROFILE=standalone` 构建出指向 `https://api.birdcoder.com` 的同款页面，`DSH_WEB_BUILD_MODE=development` 烘焙 cloud 开发边缘 `https://api-dev.sdkwork.com`；打包产物的 `resources/` 既没有 `sdkwork-release.env` 也没有 `sdkwork-app.json`。
