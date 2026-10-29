---
description: "OEM 配置：一个部署自有的 JSON 文件，指定 DeepSeek 登录与推理域名及显示品牌，供 Host 解析并发布给浏览器。"
kind: "package-reference"
---

# @deepseek-ai/dsh-sdkwork-oem

[English](README.md) | 中文

## 摘要

OEM 部署保留 DeepSeek 官方登录验证流程，只替换其运行的域名。本包在启动时解析一个 JSON 配置，作为 `ctx.oem` 提供，并通过 Web 索引注入发布显示品牌（`__DSH_OEM__`）。账号行从该服务读取 `platformOrigin` 与 `inferenceOrigin`；账号路由与 Web 搜索行读取各自的接口基址。无配置时使用出厂 BirdCoder 域名与品牌；未挂载本配置的组合保持自身的官方默认值。没有配置时所有行解析为官方域名与 BirdCoder 品牌，上游构建行为不变。

## 品牌标识

本仓库交付的应用名称是 **BirdCoder**，Logo 是 BirdCoder 小鸟（`apps/web/public/favicon.png`，桌面、欢迎页与安装器图标均由它派生）。OEM profile 的默认 `brand.name` 同样是 **BirdCoder**，因此没有 OEM 配置的构建仍然呈现 BirdCoder。

部署方可以把 `brand.name` 设为其他名称，客户端与 Desktop 的显示文案会在渲染时跟随。但这只改变显示名称：今后若 OEM 采用其他品牌，必须在同一次构建中同时替换构建期 Logo 位图——应用图标、安装器品牌图，以及 `apps/desktop/renderer/assets/welcome-bird.png`。`oem.json` 不会替换图片资源。

## 兼容性

登录流程本身永不重配：state/PKCE 处理、`/oauth/callback`、`auth_init`/`auth_exchange`、`/dsh/authorize` 与 `/dsh/authorized` 浏览器路径、请求头、grant 存储与 401 处理都保持官方实现。OEM 平台需在自己的域名后实现同一契约。

托管部署在自己的域名上完成官方浏览器流程：浏览器上报 `window.location.origin`，Host 仅当它命中 `application.origins` 时接受，并把它作为 `redirect_uri` 发给 Platform。Desktop 与 SSH 转发的本地使用继续走回环回调，无需配置。

SDKWork IAM 客户端保持生成的 `/app/v3/api/...` PC 登录路径、参数结构与 `X-Platform: pc` 请求头；`sdkwork.iamBaseUrl` 只替换源。

桌面浏览器登录保持 SDKWork 契约：应用打开 `<iamAuthorizeBaseUrl>/iam/v3/oauth/authorize`，携带 PKCE S256、`client_id=sdkwork.iamClientId`、`redirect_uri=sdkwork.iamRedirectUri`、`scope=openid profile offline_access` 与 state。托管页在 `/auth/desktop/launch?redirectUrl=…` 完成，并通过深链把 code 交回应用；应用在 `/app/v3/api/oauth/desktop_sessions` 兑换双 token 会话。出厂默认值为 `birdcoder` 与 `birdcoder://auth/callback`；部署若在 IAM 控制台注册了其他 OAuth 客户端或回调，只需改这两个字段，无需改代码。授权路径与参数保持上游原样。重定向 scheme 必须是桌面应用的 URL scheme（品牌清单的 `desktop.protocol`，出厂品牌为 `birdcoder`）：打包外壳以该 scheme 向操作系统注册协议处理器，HTTP(S) 重定向永远到不了应用。

## 配置

配置路径优先取 `DSH_OEM_CONFIG`，否则为 `$DSH_HOME/oem.json`。文件不存在表示使用出厂默认值；文件存在但无法读取、解析或校验时启动失败。Host 与 Desktop 外壳都会读取 `DSH_OEM_CONFIG`，请优先使用绝对路径：相对路径按各进程的工作目录解析。

```json
{
  "brand": {
    "name": "Acme Coder",
    "companyName": "Acme"
  },
  "application": {
    "origins": ["https://birdcoder.com"]
  },
  "sdkwork": {
    "iamBaseUrl": "https://api.birdcoder.com",
    "iamAuthorizeBaseUrl": "https://platform.birdcoder.com"
  },
  "deepseek": {
    "platformOrigin": "https://platform.acme.test",
    "inferenceOrigin": "https://gateway.acme.test",
    "allowLoopbackHttp": false,
    "rewriteBrowserOrigin": false,
    "messagesBaseUrl": "https://gateway.acme.test/anthropic",
    "webSearchBaseUrl": "https://gateway.acme.test/anthropic/v1",
    "webApiBaseUrl": "https://gateway.acme.test/v1/tools"
  }
}
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `brand.name` | `BirdCoder` | 客户端文案、侧栏字标、文档标题与 Desktop 原生文案使用的显示名 |
| `brand.companyName` | `SDKWork` | 需要厂商名的界面 |
| `application.origins` | `["https://birdcoder.com"]` | 本部署对外提供 Web 应用的源；浏览器登录回调必须命中其中之一。回环地址仍供 Desktop 与本地使用 |
| `sdkwork.iamBaseUrl` | `https://api.birdcoder.com` | SDKWork IAM PC 登录客户端的 app-api 源。生成的路径（`/app/v3/api/auth/...`）与 `X-Platform: pc` 请求头保持不变，只替换域名。非默认值会在所有环境层级替换 `ui-sdkwork-env` profile 的源；默认值则让环境 profile 继续生效 |
| `sdkwork.iamAuthorizeBaseUrl` | `https://platform.birdcoder.com` | 桌面浏览器登录使用的托管 IAM 授权源。应用打开 `<origin>/iam/v3/oauth/authorize`；登录页保持 `/auth/...` 路径，并通过 `sdkwork.iamRedirectUri` 深链返回 |
| `sdkwork.iamClientId` | `birdcoder` | 托管授权作为 `client_id` 收到的 OAuth 客户端 id。与 `ui-sdkwork-env` 的 app id（仍是 API 租户键）相互独立。必须与 IAM 控制台注册的公共客户端一致；允许小写字母、数字、`.`、`_`、`-` |
| `sdkwork.iamRedirectUri` | `birdcoder://auth/callback` | 托管登录返回时使用的已注册深链回调。必须是无凭据、查询与片段的自定义 scheme 绝对 URI，且 scheme 必须是桌面品牌的 `desktop.protocol` |
| `deepseek.platformOrigin` | `https://platform.birdcoder.com` | 登录、账号、用量与充值页面域名 |
| `deepseek.inferenceOrigin` | `https://api.birdcoder.com` | 账号路由的模型与文件域名；同时派生搜索基址 |
| `deepseek.allowLoopbackHttp` | `false` | 允许回环 HTTP（仅开发） |
| `deepseek.rewriteBrowserOrigin` | `false` | 将 Platform 浏览器页面重写到 `platformOrigin`（反向代理） |
| `deepseek.messagesBaseUrl` | `https://api.birdcoder.com/anthropic` | 账号路由的 Messages 基址；派生为 `<inferenceOrigin>/anthropic` |
| `deepseek.webSearchBaseUrl` | `https://api.birdcoder.com/anthropic/v1` | 搜索基址；派生为 `<inferenceOrigin>/anthropic/v1` |
| `deepseek.webApiBaseUrl` | `https://api.birdcoder.com/v1/tools` | Search/Fetch API 基址；派生为 `<inferenceOrigin>/v1/tools` |

DeepSeek API Key vendor（`llm-deepseek`）刻意不在 OEM 配置范围内：它的端点、密钥处理以及模型设置页的 `https://api.deepseek.com/anthropic` 占位符都保持 DeepSeek。OEM 自有模型网关应作为独立 provider 路由接入，而不是改写 DeepSeek vendor。

官方 `platformOrigin` 不能与部署的 `inferenceOrigin` 配对：否则官方账号 grant 会被转发到部署端点。反向组合——部署自有登录门户为自己的 grant 使用官方 API——是允许的；此时各接口基址保持官方默认值。显式 `messagesBaseUrl` 必须与推理域名同源。

## 环境域名

出厂默认值跟随 SDKWork 生命周期，源码模式 `pnpm dev:web` / `pnpm desktop:dev` 不会访问生产：

| 生命周期 | `platformOrigin` | `inferenceOrigin` | `iamAuthorizeBaseUrl` |
|---|---|---|---|
| `development` | `http://platform-dev.birdcoder.com` | `http://api-dev.birdcoder.com` | `http://platform-dev.birdcoder.com` |
| `testing` | `https://platform-test.birdcoder.com` | `https://api-test.birdcoder.com` | `https://platform-test.birdcoder.com` |
| `staging` | `https://platform-staging.birdcoder.com` | `https://api-staging.birdcoder.com` | `https://platform-staging.birdcoder.com` |
| `production` | `https://platform.birdcoder.com` | `https://api.birdcoder.com` | `https://platform.birdcoder.com` |

生命周期优先取 `SDKWORK_BIRDCODER_PROFILE_ID` / `SDKWORK_BIRDCODER_ENVIRONMENT`（其次无前缀的 `SDKWORK_*`），再回退到 `NODE_ENV=development` 或 `DSH_DESKTOP_DEV_APP=1`，最后为 production。只有 development 允许明文 HTTP；test、staging、production 必须 HTTPS。Messages、Search 与 Search/Fetch 基址由推理域名派生，因此同样跟随环境。

`sdkwork.iamBaseUrl` 在所有层级都刻意保持生产常量：IAM app-api 源来自活动 `ui-sdkwork-env` profile（开发为 `api-dev`、测试为 `api-test`、生产为 `api.birdcoder.com`），显式 `oem.json` 值仍然覆盖它。`oem.json` 中的显式域名始终优先于环境默认值，因此固定为生产域名的 profile 会让开发启动也访问生产，这是运维的显式选择。非生产启动会拒绝显式的 BirdCoder 生产端点（`platform`、`api` 或 IAM 域名），而不是静默跨层访问：把生产值放进 `environments.production`，并为当前环境提供自己的 section。

DeepSeek API Key vendor（`llm-deepseek`）不在本表内：它仍使用 DeepSeek 自己的端点，见下文。

一份 profile 可以同时承载各层域名。根字段共享，`environments.<lifecycle>` 在该次启动中覆盖它们，因此一个 `oem.json` 即可同时服务开发与发布，无需复制文件。优先级为 `environments.<lifecycle>` → 根字段 → 出厂默认：

```json
{
  "brand": { "name": "Acme Coder", "companyName": "Acme" },
  "environments": {
    "development": {
      "sdkwork": { "iamAuthorizeBaseUrl": "http://platform-dev.acme.test" },
      "deepseek": {
        "platformOrigin": "http://platform-dev.acme.test",
        "inferenceOrigin": "http://api-dev.acme.test",
        "allowInsecureHttp": true
      }
    },
    "production": {
      "deepseek": {
        "platformOrigin": "https://platform.acme.test",
        "inferenceOrigin": "https://api.acme.test"
      }
    }
  }
}
```

## 合并契约

上游同步必须保持以下规则：

- 登录流程保持上游实现：state/PKCE、`/oauth/callback`、`auth_init`/`auth_exchange`、`/dsh/authorize` 与 `/dsh/authorized`、请求头、grant 存储与 401 处理。只有域名来自配置；不得在 `deepseek-account-platform` 内新增 OEM 分支。
- 浏览器回调源仅限 `application.origins` 与回环路径。不得把 `loginOrigin` 放宽为任意源；托管部署的公开源必须写入配置，而不是从请求头推断。
- 不得让 DeepSeek API Key vendor（`llm-deepseek`）或其展示端点走 OEM 配置；OEM 自有模型网关应作为独立 provider 路由。OEM 可配置面限定为账号路由与 DeepSeek Search/Fetch。
- SDKWork IAM 客户端的所有 PC 路径都由生成 SDK 基于 `sdkwork.iamBaseUrl` 派生；不得在 `ui-sdkwork-iam` 中拼写 IAM API 路径或第二个 IAM 源。桌面流程保持 `/iam/v3/oauth/authorize` 与 `/auth/desktop/launch` 原样；其 `client_id` 与 `redirect_uri` 来自 `sdkwork.iamClientId` 与 `sdkwork.iamRedirectUri`，深链接收端按该重定向精确匹配，而不是接受共享该 scheme 的任意 URL。
- 端点字面量——出厂 BirdCoder 默认值（`https://platform.birdcoder.com`、`https://api.birdcoder.com`）与部署可显式恢复的官方值（`https://platform.deepseek.com`、`https://api.deepseek.com`）——只允许出现在具名默认常量（`PUBLIC_BASE_URL`、`DEEPSEEK_DEFAULT_BASE_URL`、`DEEPSEEK_WEB_API_BASE_URL`、本解析器的 `DEFAULT_*`/`OFFICIAL_*`）、测试，以及 `deepseek-account-platform/src/index.ts` 中记录在案的官方 API issuer 守卫里。修改出厂默认值属于产品变更，不是上游同步。
- 新的品牌文案通过 `LocaleRuntime.setBrand`（客户端）或 `resolveDesktopLocale(locale, brand)`（桌面端）渲染；显示文案中新增字面量 "BirdCoder" 即回归。构建期标识（`productName`、应用标识、操作系统 URL scheme、`birdcoder` 命令、安装器位图、Web manifest、文档站标识）不进入运行期配置；`sdkwork.iamRedirectUri` 只命名回调路径，不能替换打包外壳注册的 scheme。
- 新端点必须加入 OEM schema、从 `inferenceOrigin` 派生，并在 `packages/bundle/base/tests/base.spec.ts` 中断言。

每次上游合并后重新验证（第一条 grep 只允许匹配上述常量与守卫；两个计数必须成立）：

```sh
grep -rn "platform.deepseek.com\|api.deepseek.com" packages/credentials/deepseek-account-platform/src packages/llm/llm-deepseek/src packages/llm/llm-deepseek-api-key/src packages/llm/llm-deepseek-account/src packages/web
grep -c "^      inject: \[oem\]" packages/bundle/base/cordis.patch.yml   # 4: account + account route + two search providers; never the DeepSeek API-key vendor
grep -c "applicationName: desktopBrandName()" apps/desktop/src/main.ts   # 1
pnpm exec vitest run packages/host/sdkwork-oem packages/credentials/deepseek-account-platform/tests packages/client/ui-sdkwork-oem packages/client/ui-primitives/tests/oem-brand.client.spec.tsx apps/desktop/tests/locale.spec.ts
```

## 模型体验

无。该包只发布部署域名与显示名，不进入模型提示词、Session 日志或工具结果。

#### KV Cache 影响

无；配置不改变任何模型请求前缀。

## 已知限制与后续工作

- 配置只在启动时读取一次，修改后需重启生效。
- 静态构建产物保留自身文案：桌面 `productName`、应用标识、操作系统 URL scheme、更新缓存、`birdcoder` 命令、安装器位图、Web manifest 名称与文档站标识属于构建期 OEM 工作，不是运行期配置字段。更换 `desktop.protocol` 的品牌必须把 `sdkwork.iamRedirectUri` 设为同一 scheme；外壳随后通过与产品链接相同的系统注册接收登录回调。
- 搜索与 Fetch provider 只接受接口基址；其线上协议与模型名由 provider 定义。

### 开发说明

读取该配置的 bundle 行声明 `inject: [oem]`，使 `!!js` 配置表达式在服务就绪后求值。base bundle 为所有 profile 挂载该行；headless 关闭账号与凭证行，但仍会无害地解析配置。
