---
description: "SDKWork bootstrap env glue for the harness app bins: deployment-profile resolution and bootstrap access-token materialization for source, packaged, and container launches."
kind: "package-reference"
---

# @deepseek-ai/dsh-sdkwork-env-bootstrap

[English](README.md) | 中文

## 概述

harness 应用 bin 的 SDKWork 引导 env 胶水：解析启动环境声明的部署 profile（`SDKWORK_PROFILE_ID` / `SDKWORK_BIRDCODER_ENVIRONMENT` / `SDKWORK_ENVIRONMENT`），并确保 bootstrap access token 存在，token 生成与 env 文件解析复用 `@sdkwork/iam-credential-entry`。源码 checkout（`pnpm dsh web`、`pnpm desktop:dev` 以及 `apps/web` 下的 Vite 构建）会先尊重仓库根目录 `.env`，若缺失再回退到选中生命周期环境的 `.env.standalone.<environment>` 物化文件；打包、npx 与容器启动仍回退到 `https://api.birdcoder.com`。

按 sdkwork-specs `ENVIRONMENT_SPEC.md` §6.1：显式配置的 `SDKWORK_ACCESS_TOKEN`、IAM 应用引导注册产物（`.sdkwork.local.env`）以及已有的 overlay token 优先，且不必加载 `@sdkwork/iam-credential-entry`。development 档位会生成一次性本地 JWT 并写入被 gitignore 的 `.env.standalone.development.bootstrap.local` 覆盖文件，且不限定网关位置：§6.1 对 development 没有本地性条款，且受跟踪的 development 网关接受该生成的 fixture。其他档位仅在活动 SDKWork 网关能到达本机时才生成——loopback 字面量（`localhost`、任意 `127.0.0.0/8` 地址、`::1`），或系统 hosts 文件映射到 loopback 地址的主机名，后者正是开发者把本地平台网关发布到该档位域名之下的方式。test 还额外要求 `--allow-test-token-generation`。复用按 `IAM_APPLICATION_BOOTSTRAP_SPEC.md` §5.4.2 以 claims 判定——过期、生命周期与 manifest 身份决定一切，与 JWT issuer 无关：生产网关给自己的 bootstrap 凭据签名时用的同样是本地 IAM 的 `iss: sdkwork-iam-local`，由错误网关签出的 token 会在请求时失败并在那时重新生成。staging/production 始终对私有 secret 来源 fail closed。失败从不抛出：调用方继续以交互式 IAM 登录作为凭据兜底。

本模块刻意不复制任何 canonical SDKWork 逻辑：JWT 创建、manifest 身份查找、env 合并、bootstrap env 文件解析与序列化全部留在 `@sdkwork/iam-credential-entry`（动态加载，因此没有 SDKWork 兄弟 checkout 的 harness 仍可启动）。已有 overlay 用 `node:util.parseEnv` 解析，因此当该动态 import 无法解析时，`pnpm desktop:dev` 仍能把 token 投影出去。

## 目录

- [用法](#usage)
- [Model Experience](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

## 用法
```sh
pnpm env:token:ensure [--allow-test-token-generation]
```
`pnpm build`、`pnpm desktop:dev` 与 `pnpm desktop:dist` 都会运行此 CLI。它先调用 `applySdkworkLaunchEnv`（源码/开发 identity、网关与 overlay），再调用 `ensureSdkworkBootstrapToken`，在允许生成时写入被 gitignore 的覆盖文件。同一条链会先运行 `pnpm iam:ensure`，把本仓库声明的运行期应用注册进 IAM 租户应用表（[crate](../../../crates/sdkwork-birdcoder2-iam-application-bootstrap/src/lib.rs)）；平台只有能解析 token 携带的 `app_id`，该 token 才可用。`apps/cli` 与 `apps/desktop` 在进程启动时、`loadLayeredEnv` 冻结 ui-sdkwork-env 所投影的启动快照之前，重复同一对调用。CLI 通过 `resolveSdkworkLaunchProfile` 自动选择 launch profile（存在 `agent.app.config.json` 时为 development，否则为 production）。在源码 checkout 里，launcher 会先向上走到仓库根目录，优先套用已复制到根目录的 `.env`，再用选中生命周期环境匹配的 `.env.standalone.<environment>` 填补缺失的 SDKWork identity/gateway 键，最后把对应的 `.env.standalone.<environment>.bootstrap.local` token overlay 投影进冻结的启动快照。这样 `standalone.test` 与 `standalone.staging` 会在 `web`、`desktop` 与直接 Vite 构建之间保持一致。

其他应用注入的部署不算操作者覆盖：`applySdkworkLaunchEnv` 会先丢弃仍然与 `markInjectedSdkworkEnv` 记录的标记一致的继承 SDKWork 值（`clearInheritedInjectedSdkworkEnv`）。打包的 Desktop 应用会把自己的部署解析进 `process.env`，它派生的每个进程都会继承；没有这条规则时，从这种 shell 启动的源码运行会采用打包部署的网关。注入之后再被改动的值与标记不同，因此仍然优先。早于该标记的打包构建完全不留下来源信息，因此源码启动还会丢弃"仍恰好等于本模块 production 默认值"的继承部署——production profile id 加 production 网关 URL，且其余已存在的部署键都未改动。部分设置或被改动过的集合不会命中，因此操作者覆盖得以保留；而确实想在源码 checkout 中跑 production 的开发者仍可通过仓库 `.env` 层选择它，该层在丢弃之后才应用。
## Model Experience
无，因为本包只运行在 host 侧并写入被 gitignore 的覆盖文件，不触及模型请求。
#### KV Cache effect
无；本包既不组装也不发送 provider 请求。
## 已知限制与后续工作
- **token 刷新是手动的**：覆盖文件中的 token 在文件删除（或覆盖文件被移除）之前一直复用，因此过期的 24 小时 fixture JWT 需要删除覆盖文件并重启。token 有效性归 canonical 包所有；本模块不解码 JWT。
- **浏览器运行时从不注册或生成**：token 生成只发生在 host launcher 中，符合 `IAM_APPLICATION_BOOTSTRAP_SPEC.md`。

### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

令牌解析顺序（显式 `SDKWORK_ACCESS_TOKEN` > IAM 注册输出 > 既有 overlay > 生成的临时令牌）镜像 sdkwork-specs 的 `ENVIRONMENT_SPEC.md` §6.1；规范变更时保持该节与本模块同步。对 `@sdkwork/iam-credential-entry` 的动态导入是无 sibling checkout 环境的关键路径——不要提升为静态导入。

</details>

## 运行时不变量

不发布运行时不变量伴随检查；该包不拥有任何包内持久事件流；overlay 文件副作用由单元测试覆盖，env 文件解析保留在规范的 `@sdkwork/iam-credential-entry` 包中。
