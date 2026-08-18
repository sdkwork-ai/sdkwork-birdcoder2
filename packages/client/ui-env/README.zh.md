# @deepseek-ai/dsh-client-ui-env

[English](README.md) | 中文

SDKWork 部署环境插件：共享的 `ui-env` 设置作用域（活动环境 + 每环境一个 profile），以 `ctx.env` 服务暴露。每个 sdkwork 集成插件（ui-iam、ui-feedback、ui-appstore 及未来的插件）都从这个服务读取自身的部署值，因此部署切换环境只改一处，而不是逐个插件配置。

## 配置

`ui-env` 设置命名空间（本包 node 半部注册于 host 侧，经 api-proxy 的产品命名空间列表暴露给浏览器）携带：

| 字段 | 默认值 | 含义 |
|---|---|---|
| `environment` | `production` | 活动环境；其 profile 供给所有 sdkwork 集成 |
| `development` | 见下 | 开发环境 profile（API 网关 origin、app id、app key、access token） |
| `testing` | 见下 | 测试/预发环境 profile |
| `production` | 见下 | 生产环境 profile |

每个 profile 默认产品网关 origin（development 为 `http://api-dev.birdcoder.com`、testing 为 `https://api-test.birdcoder.com`、production 为 `https://api.birdcoder.com`）、`appId: sdkwork-birdcoder`、`appKey: sdkwork-birdcoder`、`accessToken` 为空。部署方按需覆盖 profile 字段：

```yaml
ui-env:
  environment: testing
  development:
    apiBaseUrl: http://api-dev.birdcoder.com
    appKey: sdkwork-birdcoder-dev
  testing:
    apiBaseUrl: https://api-test.birdcoder.com
    appKey: sdkwork-birdcoder-test
    accessToken: <staging access token>
  production:
    apiBaseUrl: https://api.birdcoder.com
    appKey: sdkwork-birdcoder
```

### 启动环境投影

host 注册会把启动环境投影到命名空间的组合 `base` 层，因此 SDKWork env 文件可以直接驱动浏览器 SDK 配置，无需编辑设置文档。启动环境声明了 SDKWork profile（`SDKWORK_PROFILE_ID` 或 `SDKWORK_BIRDCODER_ENVIRONMENT`/`SDKWORK_ENVIRONMENT`）时，注册会设置 `environment` 为声明的层级（`development`、`test` → `testing`、`production`）；活动 profile 的 `apiBaseUrl` 取 `SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL` / `SDKWORK_BIRDCODER_APP_API_BASE_URL` / `SDKWORK_BIRDCODER_APPLICATION_PUBLIC_HTTP_URL` 中首个非空值；活动 profile 的 `accessToken` 取 `SDKWORK_ACCESS_TOKEN`（`@deepseek-ai/dsh-sdkwork-env-bootstrap` 的启动 ensure 步骤会把生成的 token 物化进进程环境）。未打包的 `pnpm desktop:dev` 会先套用 development 物化文件，因此投影 origin 为 `http://api-dev.birdcoder.com`；打包后的桌面构建套用 `https://api.birdcoder.com`。解析顺序是 schema 默认值 → base 层 → 用户设置文档：用户编辑过的 `ui-env:` 分区始终优先，因此 env 文件是部署默认值而非强制覆盖。

## 消费方

- **ui-iam** 以活动 profile 的 `apiBaseUrl` 作为 IAM app-api origin、`appId` 作为租户应用 id；其自身设置分区只保留展示与登录开关。
- **ui-feedback** 以 `apiBaseUrl` 作为收集端 origin、`appKey` 用于提交。提交在 profile 配置了 `accessToken` 时使用它（非交互式部署）；否则回退到已挂载 IAM 会话的 token。
- **ui-appstore** 以 `apiBaseUrl` 作为目录 origin，并让 profile 的 `accessToken` 优先于已挂载 IAM 会话的 token。

活动 profile 的 `apiBaseUrl` 为空即「未配置」：反馈行隐藏、IAM 模式栏条目关闭，应用商店显示配置提示；切换到未配置的环境即可关闭 sdkwork 表面，无需逐个插件设置。

## Model Experience

无，因为环境服务是纯设置表面，这里的内容不会进入模型请求。

#### KV Cache effect

无；本包既不组装也不发送 provider 请求。

## 已知限制与后续工作

- **access token 按环境共享**——profile 为所有 API 客户端携带一个静态 token；按消费者隔离凭据需要 credential-reference 集成。
- **环境切换是设置文档编辑**——暂无应用内环境选择器；切换在下一次作用域移动时生效，无需重载。
