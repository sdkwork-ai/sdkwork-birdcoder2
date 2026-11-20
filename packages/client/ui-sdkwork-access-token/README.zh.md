---
description: "SDKWork Access Token 初始化插件：在 sdkwork-* 工程目录的右键菜单中增加「初始化 Access Token」，弹窗把公共应用访问令牌（租户级或组织级）写入所选应用根的 Profile 矩阵，覆盖 Vite、Flutter、小程序、Harmony 原生与其他 JSON 运行时根。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-access-token

[English](README.md) | 中文

## Summary

每个带清单的 SDKWork 应用根都按 Profile 持有一个公共应用访问令牌（`APP_ACCESS_TOKEN_SPEC.md` §2）。本插件从工作区行入口初始化这套矩阵：右键名称以 `sdkwork-` 开头的工程目录并选择 **初始化 Access Token**。弹窗会发现应用根（工程根本身或其 `apps/*` 子目录），读取各自的 `agent.app.config.json`，让操作者选择 Token 级别、应用类型、运行时目标与环境，预览声明后再把确定性的令牌写入各格式已提交的 Profile 文件。

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>

## Use this package

插件作为 web-app 的 `ui-sdkwork-access-token` 行挂载。启用后它提供：

- 工作区工程菜单中的 **初始化 Access Token** 行（通过 `ui-sdkwork-workspace-row-menus`），仅在被点击工程目录名以 `sdkwork-` 开头时出现；
- 共享工作区右键菜单中的同一动词，供没有部署行菜单插件的组合使用；
- 一个 `shell.overlay` 弹窗，通过 `uiWorkspace` 目录桥读写工程文件。

弹窗选项：

| 选项 | 作用 |
| --- | --- |
| 公共隔离 Token | 由清单身份离线生成并写入 Profile 矩阵（§2），用于登录前的租户/组织隔离 |
| 签名 Access Token | 登录 SDKWork 账号后通过 §8 交换生成，仅限本人创建的应用，约 1 小时可撤销，不写入仓库 |
| 租户级 | `organization_id=0`，`login_scope=TENANT`，`ownership_scope=TENANT` |
| 组织级 | 非 0 组织 ID，`login_scope=ORGANIZATION`，`ownership_scope=ORGANIZATION` |
| 应用类型 | Profile 文件载体：Vite `.env.<profile>`、Flutter `env/sdkwork.<profile>.json`、小程序 `config/mini-program/runtime-env.<profile>.json`、Harmony 原生与其他 JSON 运行时根 `config/app/runtime-env.<profile>.json` |
| 运行时目标 | 令牌声明的运行时目标（`browser`、`flutter-android`、`mini-program`、`harmony-native`、`android-native` 等） |
| 环境 | 十个 Profile 矩阵中的任意子集，默认全选 |

已有 Profile 内容会被保留：dotenv 文件保留其他所有键与自身行尾，JSON 运行时文档保留其他成员，已携带相同令牌的文件会报告为未变化而不是被重写。

### 记住的登录（DSH home）

签名模式优先复用已挂载的 IAM 会话；否则读取 Host 设置分区为本工程记住的登录，再退回表单输入。持久权威是本插件的标准设置分区（`ui-sdkwork-access-token` 的 `accounts`），由 Host 设置服务保存在 Harness home 下；Host 侧同时把它投影为运维可读文件 `<DSH_HOME>/sdkwork/access-token.config.json`（`$DSH_HOME`，否则 `~/.dsh`），以 `0600` 原子写入。应用仓库内不写任何登录文件。

```json
{
  "schemaVersion": "1.0.0",
  "kind": "sdkwork.access-token-config",
  "updatedAt": "2026-01-01T00:00:00.000Z",
  "accounts": [
    {
      "project": "D:\\sdkwork-space\\sdkwork-im",
      "username": "admin",
      "password": "…",
      "baseUrl": "https://api-dev.sdkwork.com",
      "bootstrapAccessToken": "<public application token>",
      "environment": "development",
      "updatedAt": "2026-01-01T00:00:00.000Z"
    }
  ]
}
```

每个工程目录一行（Windows 路径大小写不敏感、两种分隔符均可）。`baseUrl`/`bootstrapAccessToken` 为空时回退到共享 ui-sdkwork-env Profile；`environment` 预选交换生命周期。浏览器只通过 `ctx.configForms` 读写设置分区，从不直接读写该文件。密码仅存在于组件状态用于登录调用，会话建立后立即清空；令牌、密码与请求头都不会进入控制台。

**admin/operator 账号会自动记住。** 登录账号是管理员/操作员账号（`admin`、`operator`，或以数字或 `. _ + -` 延续的同类名称，包括邮箱的本地部分）时，登录成功会 upsert 该工程的记录到设置分区，Host 随后重写投影文件。相同事实重复登录会报告“已是最新”且不写任何内容。普通账号绝不落盘。

<a id="understand-the-implementation"></a>

## Understand the implementation

- `src/index.ts` — Host 侧：持久化 `ui-sdkwork-access-token` 设置分区（记住的 admin/operator 登录）以及原子写入的 `<DSH_HOME>/sdkwork/access-token.config.json` 投影；启动时与每次该分区提交后重写。
- `src/access-token-settings.ts` — 两个编译面共享的平台无关契约：命名空间、投影常量、账号行、工程身份键、查找/upsert、投影文档与页面全局路径解码。
- `src/client/index.ts` — 注册字典，提供行菜单派发所调用的 `accessTokenInitializer` 服务，把弹窗挂到 `shell.overlay`，并注册共享工作区右键菜单贡献。其 `inject` 为 `['slots', 'locale', 'configForms']`；`uiWorkspace`、`env`、`iam` 与 `contextMenus` 以可选方式读取，因此插件在最小组合中也能加载。
- `src/client/accessToken.ts` — `APP_ACCESS_TOKEN_SPEC.md` §3 的公共令牌契约：固定头部（`alg: none`、`kid: public-app-token`）、必需声明、租户/组织范围推导、确定性的生成时刻，以及在声明矛盾时失败关闭的解码器。相同输入下字节与 `tools/app-access-token.mjs` 一致（有基准 fixture 固定）。
- `src/client/applicationTypes.ts` — §2 的 Profile 文件表，以及弹窗默认应用类型背后的清单/框架/标记文件推断。
- `src/client/project.ts` — 发现工程目录下带清单的应用根，并从 `agent.app.config.json` 读取各自身份（`backend.appId`、`backend.tenantId`、`backend.organizationId`、`backend.accessTokenPermissionScope`）。
- `src/client/initializer.ts` — 先整体校验公共令牌请求再写入，随后按格式合并令牌，并创建该格式需要的嵌套 Profile 目录。身份问题会在写入任何文件前中止；单个不可读的 Profile 文件只会使该文件失败。
- `src/client/signedToken.ts` — 签名流程规则：管理员/操作员账号识别、本人应用过滤、拒绝 `alg:none` 的 JWT 解码，以及失败关闭的凭据校验（锚点、发布范围、所有者、租户、生命周期、到期时间、环境）。
- `src/client/credentials-contract.ts` — 弹窗经 Host 设置分区获得的纯数据读/写/路径接口。
- `src/client/sdkworkIamPort.ts` — 基于 `@sdkwork/iam-app-sdk`（密码登录与交换）和 `@sdkwork/deployments-app-sdk`（应用列表）的传输实现，每次调用使用独立的 token manager。
- `src/client/SignedTokenPanel.tsx` — 登录、本人应用列表、交换与凭据展示。
- `src/client/AccessTokenDialog.tsx` — 模式切换、公共令牌表单、声明预览与逐文件结果列表。

### 生成逻辑

两种模式回答两个不同的凭据问题，弹窗从不混用。

**公共隔离 Token（写入 Profile 矩阵）**：对每个选中的应用根与 Profile：`app_id = aud = 清单 backend.appId`（或输入的部署锚点），`tenant_id = 清单 backend.tenantId`（或输入的覆盖值），租户级 `organization_id = 0`，组织级为输入的非 0 组织 ID；`login_scope`/`ownership_scope` 由该组织绑定推导；`environment`/`deployment_profile` 来自 Profile id；`runtime_target` 来自所选应用类型；`permission_scope` 来自清单的引导权限范围；`user_id=0`；固定 `iat`/`exp`；签名段为字面量 `public`。JWT 具有确定性，重复初始化不产生差异；现有 dotenv/JSON 文档只做合并，绝不整体替换。

**签名 Access Token（登录后签发）**：登录按以下顺序解析：已挂载 IAM 会话（其 access/auth 令牌对）、DSH home 设置分区中该工程记住的登录（`accounts[project]`）、表单输入。密码登录以公共引导令牌作为 credential-entry 的 `Access-Token` 请求网关。若是 `admin`/`operator` 登录，随后 upsert 到设置分区（幂等；普通账号不保存），Host 重写 `<DSH_HOME>/sdkwork/access-token.config.json` 投影。会话的 IAM 用户 ID 是归属键；部署应用列表过滤为该用户创建（`createdBy`）或独占（`ownershipScope=USER` 且 `ownerUserId` 匹配）的应用。所选应用的 `deployApplicationId` 与所选生命周期提交到 `POST /app/v3/api/iam/app_access_tokens`；返回的 access/auth 令牌对会被解码校验：签名算法不是 `none`、`app_id`/`aud` 等于锚点、发布范围与安装一致、USER 发布必须指向会话用户、`tenant_id` 与会话一致、生命周期不超过 1 小时类别、`expiresAt` 尚未到期。全部通过后才展示凭据并提供复制；绝不写入已提交文件。

公共模式令牌是隔离凭证而非会话凭证：两种支持的级别都不携带用户身份（`user_id=0`）、不携带 `data_scope`，`permission_scope` 也不超出应用根的引导权限范围（默认 `iam:self`）。签名模式相反：它是真实的用户会话凭据，由 IAM 签发给已登录账号并受其权限约束。

<a id="known-limitations-and-deferred-work"></a>

## Dev Note

这是遵循仓库命名契约的 fork 包（`sdkwork` 标记）。Host 侧拥有标准设置分区与 DSH home 投影；浏览器侧是动态插件，文件访问经过受治理的 `uiWorkspace` 目录桥（单次文本写入上限 1 MiB，父目录必须已存在），签名流程使用生成式 SDKWork 客户端，基于已挂载 IAM 会话或密码登录。

## Runtime invariants

测试套件验证：卸载插件 fiber 会移除服务、浮层注册与右键菜单贡献（HMR 安全）；令牌构建器逐字节复现规范生成器；重复初始化不会写入任何文件；Host 投影遵循 `$DSH_HOME` 并在提交后原子重写；浏览器通过设置表单读写记住的登录；真实 SDK 传输按文档路由、请求头与请求体发送登录、应用列表与交换调用。发射工程通过本地声明 facade 解析 SDK 包；`tsconfig.tests.json`（`pnpm typecheck:tests`）编译真实 SDK 源码作为漂移守卫。

## Model Experience

None，因为本包通过工作区手势写入已提交的客户端 Profile 文件；它不增加提示词、工具结果或会话事件。

#### KV Cache effect

None；不组装或变更任何 provider 请求。

## Known Limitations and Deferred Work

- admin/operator 自动保存按名称识别（`admin`/`operator` 加数字或分隔符，包含邮箱本地部分），因为会话不携带角色声明；若部署方使用其他名称的特权账号，可手工向设置分区添加记录（或写入投影文件）。
- 记住的密码以明文保存在 Harness home 内（设置文档与 `0600` 投影文件），因为密码授权需要原文；它绝不进入仓库，会话建立后弹窗会从组件状态清空。
- 签名流程只提供当前登录用户创建或独占的应用，并在交换前再次校验；平台侧同时按发布范围强制鉴权。没有创建过应用的账号会看到空状态说明。
- 签名凭据是会话级凭据（约 1 小时、可撤销），仅供即时使用，故意不写入已提交的 Profile 矩阵；公共隔离令牌仍是已提交载体。
- 弹窗只初始化带清单的应用根。工程根或 `apps/*` 下没有 `agent.app.config.json` 时，会显示空状态说明而不是伪造身份，因为令牌声明来自该清单。
- 仓库级格式化器 `tools/materialize-client-env.mjs` 仍是完整物化的规范所有者（URL、绑定、云投影）。本初始化器只写 `SDKWORK_ACCESS_TOKEN`（以及 Harmony 模板的 Profile 身份键），因此若仓库的物化声明固定了部署锚点，该声明仍是其自身物化运行的锚点来源；令牌需要与该锚点一致时，请在弹窗中填入锚点。
- 令牌使用固定的生成时刻；轮换是显式的代码变更加一次全量重新生成，与规范一致。
- 只提供租户级与组织级令牌。`ownership_scope=USER`（个人安装）不在本弹窗的级别选项中。
- 一次初始化只针对一个发布级别：清单绑定了非零组织的根不能被租户级请求写入，组织级请求也必须写出该根自己的组织。请只选择同一级别的根，或分多次初始化不同级别。
- 目录桥受 Host 的文本文件上限（1 MiB）约束，并逐级创建父目录；超过上限的 Profile 文件会让该文件以 Host 消息失败。
