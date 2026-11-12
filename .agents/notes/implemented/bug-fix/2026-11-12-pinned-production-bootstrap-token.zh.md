# Agent Note: A pinned production launch runs on the committed public application token

Status: implemented

[English](2026-11-12-pinned-production-bootstrap-token.md) | 中文

## Problem

`pnpm desktop:prod` 强制使用 `standalone.production`，而 Desktop Host 是从 checkout 内的 profile 目录启动的，于是 `applySdkworkLaunchEnv` 看到一个"调用目录与仓库根不一致"的 production profile，套用 production 默认值后直接返回，既没有读取受跟踪的 `.env.standalone.production` 物化文件，也没有读取凭据包。冻结的启动快照因此完全没有 `SDKWORK_ACCESS_TOKEN`，尽管受跟踪文件里就是本部署的 public application access token——它的 `exp` 是 2100 年的轮换上限，而不是会话生命周期。

另有两处小缺陷让自愈无法发生：复用检查把 public token 的"永不过期"哨兵 `exp: 0` 读成 1970 年到期，于是符合规范的已提交 token 被判为过期；`ensureSdkworkBootstrapToken` 删除过期的已配置 token 后，对 staging 与 production 直接 fail closed，从不考虑已提交 token。于是每个 app-api 调用都用渲染进程手头剩下的东西——页面构建期 token 或一个已经过期的私有凭据。

剩下的那份凭据自身也有缺陷。IAM 按 token 的 `app_id` claim 以及注册行所属的生命周期环境，把 public application access token 绑定到一条已启用的 `iam_tenant_application` 行；本 fork 六个受跟踪根档位带的是 manifest `app.key`（`sdkwork-birdcoder2`），而不是平台注册的 runtime application id（`app_01a18b4f-6f61-7ff1-b86c-75b54995883f`，也就是本部署 `SDKWORK_APP_ID` 记录的值）。因此每个 `credential-entry-bootstrap` 路由——包括注册与登录弹窗——都回 `invalid or expired IAM access token`；对 `POST /app/v3/api/auth/registrations` 的探测矩阵中，`sdkwork-birdcoder`、`sdkwork-birdcoder2` 与 `sdkwork-iam` 都是 40103，只有 `app_01a18b4f-…` 在 `production` 下走到了请求体校验。

## Decision

源码 checkout 自行钉住 production 的启动，仍以调用目录作为 project layer，因为 checkout 的 `.env` 描述的是开发者的源码运行而非该部署；但它像其它源码启动一样解析所钉 profile 的受跟踪物化文件与凭据包。该物化文件正是永不过期的 public application access token 的所有者，钉住 profile 因此不再丢弃这次启动本来就该使用的凭据。

`ensureSdkworkBootstrapToken` 把 `exp: 0` 与缺失 `exp` 都视为永不过期；对 staging 与 production，它在 fail closed 之前先采用受跟踪物化文件中可复用的 token——位置在 operator 凭据 provisioning 之后，后者仍是首选的私有来源。被丢弃的 token 会按"已过期或档位不符"报告，而不再被描述成一次性 fixture。

六个受跟踪根档位现在携带平台注册的 runtime application id，根 manifest 也把同一个 id 声明为 `backend.appId`——这是 `IAM_APPLICATION_BOOTSTRAP_SPEC.md` 指定为唯一由 manifest 推导的 runtime identity、且 `APP_ACCESS_TOKEN_SPEC.md` 要求出现在 token `aud`/`app_id` 里的字段。于是按 manifest provisioning 请求的正是已提交 token 携带的 id，而不是让部署自行分配一个新的 `app_<uuid>`、让任何已提交 token 都无法匹配。

## Alternatives considered

**在 online 车道的 launcher 里强制注入 token。** `onlineLaunchEnvironment` 已经强制 `standalone.production` 的 identity 与网关，因此也可以顺带强制受跟踪文件里的 token。但同样的缺口会留给 `dsh --environment production` 以及任何在 checkout 内钉住 profile 的其它 launcher，而且把凭据归属放进一条调试车道，而不是所有 launcher 共用的 resolver。

**production 继续 fail closed。** fail-closed 规则的目的是让构建永不铸造凭据；已提交的 public application token 不是铸造出来的、也不私有，而且正是 `APP_ACCESS_TOKEN_SPEC` 指定给这个位置的凭据。在 checkout 里明明有一份有效的已提交 token 时仍然 fail closed，正是本次报错的来源。

**把 `exp: 0` 当作已过期。** 否决：`APP_ACCESS_TOKEN_SPEC` 把 `0` 定义为永不过期，这样做同时也让 canonical 生成器自己的默认值无法复用。

**保留 `backend.appId` 的旧值 `sdkwork-birdcoder`，改成按部署各发一份 token。** 这样今天那台分配了 id 的平台能用，但本地平台会把同一个应用注册成新的 `app_<uuid>`，已提交 token 在那里必然失效，仓库也就变成"每台机器一份凭据"。声明已注册的 id，才能让一份已提交凭据在每个按本 manifest provisioning 的部署上有效。

## Consequences

`pnpm desktop:prod` 以及任何在源码 checkout 里钉住 production 的启动，都带着已提交的 public application token 启动，因此 app-api 隔离在交互式登录之前即可用，并且跨重启有效。这次启动仍然不拥有私有凭据：仍可复用的 operator 导出 token 依旧优先，staging 与 production 也依旧先尝试用 operator 凭据 provisioning。过期的私有凭据会被已提交 token 替换并报告，所以"重新生成、然后 fail closed"的路径不再让启动一无所有。

代价是：manifest 现在写的是一个注册时分配的标识，而不是可读的应用 key；若某个部署此前用别的 id 注册过本应用，必须重新注册或更新那一行，已提交 token 才能在那里解析成功。

## Verification

`packages/boot/sdkwork-env-bootstrap/tests/sdkwork-env-bootstrap.spec.ts` 钉住钉住 profile 的解析、永不过期哨兵、已提交 token 兜底与过期凭据替换；`apps/desktop-host/tests/launch-environment.spec.ts` 钉住 online 车道的启动环境。对已部署网关，用每个受跟踪 production token 请求 `POST /app/v3/api/auth/registrations` 都返回 `40001 username, email, or phone is required`——即解析成功——而旧 token 返回的是 `40103 invalid or expired IAM access token`。
