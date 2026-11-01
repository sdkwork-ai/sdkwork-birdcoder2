---
description: "根据已登录的 SDKWork IAM 会话在 Host 侧开通 BirdCoder 中转：把会话令牌镜像为中转凭据、声明 llm-pi-ai 配置档，并在登出时只移除本插件写入的内容。"
kind: "package-reference"
---

# @deepseek-ai/dsh-birdcoder-account

[English](README.md) | 中文

## 摘要

`dsh-birdcoder-account` 把桌面端镜像的 SDKWork IAM 会话变成可直接使用的 BirdCoder 中转。BirdCoder 在其 OpenAI 兼容的 `/v1` 面上接受 IAM `authToken` 作为 API Key，因此已登录用户不需要另外配置凭据。插件把令牌写入 `BIRDCODER_API_KEY`，并在设置中没有 `birdcoder` 配置档时以 `openai-completions` 声明该配置档。随后「模型」页会显示已配置的提供方及其模型，请求也用该令牌认证。用户保存的 Key 始终优先。登出只移除插件自己写入的内容，并恢复此前的默认模型。

## 目录

- [使用本包](#use-this-package)
- [实现说明](#understand-the-implementation)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)

<a id="use-this-package"></a>
## 使用本包

插件依赖 `credentials` 与 `settings` 服务；组合挂载了 `llm` 与 `agentDefaultModel` 时会一并使用。没有镜像会话时它不做任何事，也就是纯浏览器部署的形态。

Web/桌面 bundle 也随包提供同一份 `birdcoder` 配置档，并把 `agent-default-model` 设为 `birdcoder` / `deepseek/deepseek-v4-pro`（中转目录置顶的 DeepSeek 条目），因此登录前 BirdCoder 就是选择器中的第一个提供方分组，也是新会话的默认模型。插件随后提供登录凭据。对于不随包提供这些行的组合，插件自己的配置档声明与默认模型切换仍然生效。

```yaml
- id: birdcoder-account
  name: '@deepseek-ai/dsh-birdcoder-account'
  config:
    # Defaults shown; omit them unless the deployment relocates the files.
    sessionFile: /home/user/.birdcoder/iam/session.json
    stateFile: /home/user/.birdcoder/iam/birdcoder-account.json
    credentialRef: BIRDCODER_API_KEY
    settingsNs: llm-pi-ai
    pollIntervalMs: 2000
```

`sessionFile` 默认 `<DSH_HOME>/iam/session.json`，`stateFile` 默认与其同目录的 `birdcoder-account.json`，`credentialRef` 默认 `BIRDCODER_API_KEY`，`settingsNs` 默认随包挂载的 `llm-pi-ai` 条目。`pollIntervalMs: 0` 关闭轮询，只在挂载时同步一次。

### 已登录时的行为

每次同步读取会话并执行：

- **镜像令牌**：当引用未配置，或其中的值正是本插件上一次写入的令牌时，把当前令牌写入 `credentialRef`。不同的值是用户自己的 API Key，插件不会改动。
- **声明配置档**：`settingsNs` 中没有 BirdCoder 配置档时，写入 `{ providers: { birdcoder: { api: 'openai-completions', apiKeyEnv } } }`。OpenAI 兼容面才会把非 `sk-` 的 Bearer 值解析为 IAM 登录令牌；BirdCoder 的 Anthropic 面只接受 API Key。已存在的配置档——包括 bundle 随包提供的那份——既不会被编辑，也不会在登出时被删除。
- **选择中转默认模型**：当前默认仍是未认证的 `deepseek-official`，且没有其他提供方解析出已配置凭据时，保存第一个 BirdCoder 模型，优先选择 `deepseek` 标识。这是不随包提供 bundle 默认值的组合的兜底；用户已经把默认切到其他提供方时保持不动。

### 登出时的行为

会话旁的标记文件记录哪些写入属于本插件。会话消失时，插件删除镜像凭据；仅当配置档仍等于它声明的形状时才删除配置档；保留用户保存的 Key 及其配置档；当前选择仍是它保存的 BirdCoder 选择时，恢复此前的默认选择。会话文件损坏不算登出：插件保留上一次状态，避免一次瞬时读取丢掉有效凭据。

<a id="understand-the-implementation"></a>
## 实现说明

插件不提供 Cordis 服务。它在 `apply` 中创建一个控制器，在挂载时与轮询间隔上同步会话，把重叠的同步串行化，并在 fiber 销毁时停止。控制器只接收凭据与设置接缝的窄接口，因此回归测试不需要 Loader 即可驱动。会话与标记读取器位于 `src/session.ts`；令牌先经 SHA-256 哈希，标记文件因此不保存密钥本身。

轮询是有意选择：桌面端原子写入会话文件，按间隔重新读取比维护一个跨平台、销毁时机必须精确的 watcher 更容易掌控。间隔决定登录后中转多久可用、登出后多久消失。

<a id="model-experience"></a>
## 模型体验

None, as the package configures relay credentials and provider settings; it adds no prompt section, tool, or session content.

#### KV Cache effect

不改变任何提示词字节。插件选择 BirdCoder 默认模型后，下一个请求指向另一条提供方路由，因此提供方侧的前缀复用不会跨过这次切换。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- **仅桌面端登录来源**——插件读取桌面端镜像到 `<DSH_HOME>/iam` 的会话文件。纯浏览器登录不会在 Host 侧留下文件，因此那里的中转仍通过保存 API Key 配置。
- **声明的配置档使用 OpenAI Chat Completions**——登录令牌在 BirdCoder 的 `/v1` 面认证。想用 Anthropic 面的用户需保存中转 API Key 并修改配置档协议；登录令牌在该面不能认证。
- **模型列表需要 API Key**——BirdCoder 的 `GET /v1/models` 用 API Key 认证，不接受登录令牌，因此已登录用户看到的是随包的中转种子列表，直到保存 Key 或手工添加模型。
- **轮询延迟**——登录或登出在下一个间隔（默认两秒）才到达 Host，不是即时生效。
- **凭据检测基于引用**——默认模型切换检查每个已配置提供方配置档的 `apiKeyEnv`；通过提供方原生环境发现认证、但没有命名引用的提供方不会被判定为已认证。
- **没有随包配置档时，声明属于用户设置写入**——部署若不随包提供 bundle 配置档，又固定了 `llm-pi-ai` 或设置文档只读，镜像凭据仍然生效，但不会生成提供方配置档。

<a id="dev-note"></a>
### 开发备注

[BirdCoder 中转路由](../../llm/llm-pi-ai/src/relay.ts) 拥有端点与种子目录；本包只提供登录会话使其成为可能的凭据与配置档。
