# Agent Note：打包后的桌面发布包携带其 SDKWork 部署

Status: implemented

[English](2026-11-01-desktop-release-sdkwork-env.md) | 中文

## 问题

引导凭据阶梯本身——哪些来源优先、生成或注册的 token 如何复用——由 [2026-08-18-sdkwork-env-bootstrap-token-and-projection.zh.md](2026-08-18-sdkwork-env-bootstrap-token-and-projection.zh.md) 负责；本记录只增加打包后的路径。

源码启动与安装后的应用从同一份配置里解析出了不同的 SDKWork 部署。`apps/desktop-host/src/launch-environment.ts` 在进程启动时应用 SDKWork 启动环境；在源码 checkout 中它会向上走到仓库根，那里受跟踪的 `.env.<deployment-profile>.<lifecycle>` 携带部署，用户私有凭据包 `~/.sdkwork/<application-code>/credentials/<profile-id>.json` 携带其引导凭据，因此 `pnpm desktop:prod --insecure-tls` 能通过认证。安装后的应用运行在自己的 home 目录，既没有 checkout 也没有凭据包：同一段代码从内置默认值解析出 production 身份与网关，却找不到任何凭据，于是渲染进程的生成式 SDK 在每个 access-token-only 请求上失败并报 `access-token-only request requires Access-Token before request dispatch`，而交互式登录是当时唯一的凭据来源。test 或 staging 档的构建则有相反的缺陷：它静默解析到 production 网关，因为被写入的部署选择同样不存在。

第一版修复把该产物做成显式选项（`DSH_DESKTOP_SDKWORK_RELEASE_ENV=1`），于是失败仍然是默认路径：一次忘记加开关的打包会产出能装、能启动、却在用户提交凭据表单时才失败的应用。该选项还让打包过程可以 provision 凭据，于是构建可能静默重新生成一个 operator 已经确定的令牌。

## 决策

### 分发类别决定，且 `deployment` 是默认

`DSH_DESKTOP_DISTRIBUTION` 声明正在产出的产物的类别，对应 sdkwork-specs `ENVIRONMENT_SPEC.md` 第 6.1.1 节。`deployment` 是默认类别，因为"未声明"的构建不能是坏的那一个；`public` 由发布通用版本的流水线显式声明。旧的 `DSH_DESKTOP_SDKWORK_RELEASE_ENV` 在一个迁移窗口内仍然映射（`1` → `deployment`，`0` → `public`），且新变量优先。

### 打包是只读投影

准备该产物属于 `ENVIRONMENT_SPEC.md` 第 6.1 节的 `resolve` 阶段。`prepare:sdkwork-env`（`apps/desktop/scripts/prepare-sdkwork-release-env.ts`）先运行 `applySdkworkLaunchEnv`，再以 `credentialWrite: 'forbid'` 运行 `ensureSdkworkBootstrapToken`，因此它只能复用缓存中的凭据，绝不注册、provision、签名或生成。`pnpm env:token:ensure --environment <lifecycle>` 是唯一受支持的写入入口；`--refresh` 替换仍可复用的凭据，`--resolve-only` 为从不写入的构建流水线执行同样的解析。生命周期来自 `DSH_DESKTOP_SDKWORK_ENVIRONMENT`（默认 production），继承来的部署选择键会先被丢弃，没有可复用凭据的 `deployment` 构建会带着修复命令失败。

### 产物是窄的

该步骤通过 `renderSdkworkReleaseEnv` 写出 `resources/sdkwork-release.env`，只包含 `SDKWORK_RELEASE_ENV_KEYS`：部署选择、SDKWork 各面 URL、凭据包携带的注册声明，以及 `SDKWORK_ACCESS_TOKEN`。模型提供方密钥、operator 引导凭据、数据库 URL 与 `VITE_*` / `PORTAL_PUBLIC_*` 均不在列表中，手工编辑的文件声明它们时会被报告并忽略。投影出的凭据与缓存中的那份字节一致，因此过期、轮换与吊销在两种载体上表现相同。

### 安装后的应用在解析之前应用它

桌面主进程把资源路径作为 `DSH_DESKTOP_SDKWORK_RELEASE_ENV_FILE` 传给 Host；`resolveSdkworkReleaseEnvFile` 优先采用启动环境给出的显式路径，否则使用打包资源，源码启动则不传。Host 在 `applySdkworkLaunchEnv` 之前调用 `applySdkworkReleaseEnv`，因此该产物只填补启动环境留空的名字，operator 覆盖始终优先。token 随后走 `IAM_APPLICATION_BOOTSTRAP_SPEC.md` 第 5.4 节的常规路径：仍然有效的凭据原样复用；投影的那份不再可复用时，Host 会报告产物路径、补救方式与 provision 命令，因为 `deployment` 构建同样无法通过交互式登录完成认证。

### 唯一的写入由一个显式命令拥有

`pnpm env:token:ensure --environment <tier>` 固定生命周期并丢弃继承的部署选择，开发者因此可以写出部署构建读取的 production 或 test 凭据包，而不是永远解析到 development fixture；`--allow-test-token-generation` 仍然为一次性 test fixture 把关，`--refresh` 是唯一的替换路径。`pnpm build` 以 `--resolve-only` 运行它，因此准备构建产物只会复用令牌，绝不创建。

### 规范已经写明

三处规范承载这条规则，仓库无法再凭记忆重新发明选项：`ENVIRONMENT_SPEC.md` 第 6.1 节新增 `resolve` / `provision` / `refresh` 消费阶段表，第 6.1.1 节变成分发类别契约并以打包失败取代警告，第 6.1.2 节新增源码启动与打包产物的一致性（同一解析器、同一键集、投影而非重生成）。`IAM_APPLICATION_BOOTSTRAP_SPEC.md` 第 5.4.5 节把打包约束为只拷贝，`DESKTOP_APP_ARCHITECTURE_SPEC.md` 把两处 `MAY` 改成按类别的 `MUST` / `MUST NOT`。

## 备选方案

**保留显式选项。** 那正是缺陷本身：安全路径成了必须记住的那条，一旦忘记就产出能安装、能启动、却在凭据表单处失败的产物。无法通过认证的默认不是安全的默认。

**缓存为空时让打包去 provision。** 它能让一条命令产出可用产物，也会让每次构建依赖网络状态与隐藏的 operator 凭据、重新生成 operator 已确定的值，并把真实的配置错误藏在一次成功的构建之后。带着修复命令失败，才能把写入权留在规范指定的位置。

**始终写入该产物。** 公开发布就会随发布工程师恰好配置的凭据一起分发。声明的类别保证公开流水线不含凭据，`ENVIRONMENT_SPEC.md` 第 6.1.1 节也写明了分发规则。

**继续依赖安装机自己的凭据包或 operator 凭据。** 当 operator 在目标机器上 provision 了 `~/.sdkwork/iam-bootstrap/<lifecycle>.json` 时它已经可用，也是续期路径。但它帮不了没有这套配置的部署构建，而那正是失败场景：打包机持有凭据，安装后的应用没有。

**只写入 `SDKWORK_ACCESS_TOKEN`。** 默认网关恰好与 production 令牌匹配，但 test 或 staging 构建就会把该凭据发给 production 网关，部署身份仍然是隐式的。写入选择键让产物描述它所认证的部署。

**连 operator 凭据一起写入。** 它可以让安装后的应用无需目标机器配置即可续期，也会让产物中的秘密材料成倍增加，并让构建身份依赖某个 operator 账号。产物改为只携带一个可吊销的引导凭据，续期仍交给宿主机自己的 operator 配置或登录。

## 结果

`deployment` 构建现在无需依赖安装用户的 shell 环境即可访问其 SDKWork 网关并通过认证，test 或 staging 档的构建也能到达正确的网关而不是 production 默认值。忘记声明类别现在产出的是携带凭据的产物，而不是坏掉的产物；公开流水线必须明确写出 `public`。打包不再能挪动令牌：构建复用 `env:token:ensure` 已经确定的值，因此过期或吊销的凭据会以明确的打包或启动失败呈现，而不是悄悄换成与 operator 检查过的不同的令牌。产物仍然包含一个可吊销的引导凭据，因此它只属于其构建针对的部署，刷新它意味着重新执行显式命令并重新打包。

## 验证

`pnpm exec vitest run packages/boot/sdkwork-env-bootstrap/tests apps/desktop-host/tests/launch-environment.spec.ts apps/desktop/tests/prepare-sdkwork-release-env.spec.ts apps/desktop/tests/sdkwork-release-env.spec.ts apps/desktop/tests/package-target-stages.spec.ts apps/desktop/tests/desktop-package-environment.spec.ts` 覆盖允许清单、渲染、解析、优先级与部署选择清除、Host 应用产物与 operator 优先、resolve 阶段拒绝创建凭据、refresh 不会回退到它被要求替换的值、打包步骤的分发类别与缺令牌失败、拒绝无产物的 `deployment` 构建的打包门禁、外壳传入的资源路径，以及在下载环境下运行该步骤的打包阶段。对安装路径的本地模拟——一个空 home 目录，分别在有无产物时——两种情形都解析到 `standalone.production` / `https://api.birdcoder.com`，前者没有令牌，后者是打包机的 production 令牌。
