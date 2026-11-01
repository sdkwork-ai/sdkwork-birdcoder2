# Agent Note: 从 IAM 会话开通 BirdCoder 中转

Status: implemented

[English](2026-11-02-birdcoder-account-model-provisioning.md) | 中文

## Problem

BirdCoder 中转接受两种凭据：为 `api.birdcoder.com` 签发的 API Key，或把 SDKWork IAM 会话的 `authToken` 当作该 API Key 使用。`llm-pi-ai` 只认识第一种：中转而配置档是设置文档中一份命名凭据引用的条目，「模型」页也只在引用已保存时才把提供方视为可用。因此已登录用户看到的是一个「已配置但不可用」的 BirdCoder 行，还得手动粘贴一个产品已经为其签发过令牌的 Key。

桌面端会把提交后的 IAM 会话镜像到 `<DSH_HOME>/iam/session.json`，Host 因此能读到与渲染器相同的完整会话。缺的一步是把该文件变成中转的凭据与配置档，同时让用户自己的 Key 保持优先，并在登出时撤销自动写入。

## Decision

新增 Host 插件 `@deepseek-ai/dsh-birdcoder-account`，在挂载时以及每两秒轮询时同步镜像会话：

- **镜像凭据。** 插件读取会话的 `authToken`，通过 `ctx.credentials` 写入 `BIRDCODER_API_KEY`。写入前先读取该引用：未配置，或当前值的哈希等于标记中记录的哈希时才替换；其他值是用户自己的 Key，绝不覆盖。
- **声明配置档。** `llm-pi-ai` 没有 `birdcoder` 配置档时，插件通过 `ctx.settings.update` 写入 `{ providers: { birdcoder: { api: 'openai-completions', apiKeyEnv: 'BIRDCODER_API_KEY' } } }`。协议选 OpenAI 兼容的 `/v1` 面，因为 BirdCoder 的登录令牌通道在该面把非 `sk-` 的 Bearer 值解析为 IAM 登录令牌；它的 Anthropic 面只接受 API Key。已存在的配置档标记为 `foreign`，既不会被编辑也不会被删除。随后随包的中转目录会注册路由并公布模型；推理沿既有的 `apiKeyEnv` 路径解析镜像凭据，因此适配器无需改动。
- **默认模型。** 随包 bundle 已经把默认指向 BirdCoder，因此这是不随包提供默认值的组合的兜底。当已保存的默认仍是未认证的 `deepseek-official`，且没有其他提供方配置档解析出已配置凭据引用时，插件保存第一个 BirdCoder 模型，优先选择 `deepseek` 标识。用户已把默认放到其他提供方时不做移动。
- **归属标记。** `<DSH_HOME>/iam/birdcoder-account.json` 记录最后一次镜像令牌的 SHA-256 摘要、配置档归属（`none`、`provisioned` 或 `foreign`），以及它做过的默认选择切换。标记不保存令牌本身。
- **登出。** 会话消失时，仅当哈希仍匹配才删除镜像凭据；仅当用户层仍与声明的形状深度相等时才删除 `provisioned` 配置档；保留用户 Key 及配置档；当前选择仍是它保存的那次切换时恢复此前默认。会话文件损坏不算登出，保留上一次状态。

Web-app bundle 随包提供同一份配置档，并把 `agent-default-model` 设为 `birdcoder` / `deepseek/deepseek-v4-flash`，因此登录前 BirdCoder 就是选择器中的第一个提供方分组，也是新会话的默认模型。插件随后把该配置档标记为 `foreign`，只负责提供凭据；它自己的配置档声明与默认切换服务于不随包提供这些行的组合。

「模型」页无需改动：已保存的凭据就是它的就绪事实，而插件负责提供该凭据。

## Alternatives considered

**让 `llm-pi-ai` 在缺少密钥时查询 BirdCoder 账号服务。** 否决：这会把产品登录规则扩散进通用适配器，同时「模型」页的凭据检查仍报告 `unconfigured`，页面与请求路径会对「是否就绪」给出不同答案。

**在 web-app bundle 中直接随包 BirdCoder 配置档。** 否决：这会让未登录用户也看到中转模型，把配置档变成用户无法移除的常驻基础层事实，而且凭据仍需要同一套会话镜像。

**由渲染器通过 `credentials.set` 推送令牌。** 否决：选定的来源是 Host 可读的会话文件，它同样服务无头启动；渲染器推送会复制密钥路径，并让纯浏览器组合拥有第二个登录权威。

**用文件 watcher 监听会话。** 暂时否决：桌面端原子写入，小步周期同步比一个创建、目录出现与销毁都必须在各平台精确成立的 watcher 更容易掌控。轮询间隔是配置边界，而不是不变量。

## Consequences

在 Web 与桌面上，BirdCoder 排在模型选择器第一位，也是部署默认模型；用户自己保存的选择仍然优先。已登录用户无需打开「模型」页即可获得 BirdCoder 模型，服务它们的凭据就是用户已经拥有的登录令牌。粘贴过 API Key 的用户保留自己的 Key；插件不会把用户 Key 换成会话令牌。登出会把组合恢复到未配置的 BirdCoder 状态，包括默认模型，同时不删除用户自己的编辑。

自动写入在 profile patch 中可见，也可以从「模型」页移除。登录期间删除配置档会在本次会话中被记住，下次登录会重新开通。纯浏览器登录没有 Host 会话文件，仍走 API Key 路径。把 `llm-pi-ai` 设为只读的部署会保留镜像凭据，但不会得到配置档。默认模型切换只识别命名了凭据引用的提供方；使用提供方原生环境发现的提供方不会被判定为已认证。

BirdCoder 的 `GET /v1/models` 用 API Key 认证，不接受登录令牌，因此已登录用户在选择器里看到的是随包的中转种子，直到保存 Key 或手工添加模型。想用 Anthropic 面的用户需保存中转 API Key 并修改配置档协议；登录令牌在该面不能认证。

## Testing

`packages/credentials/birdcoder-account/tests/birdcoder-account.spec.ts` 用真实临时文件与假的凭据／设置／模型接缝驱动控制器：登录镜像令牌、声明 OpenAI Chat Completions 配置档并选择中转默认；用户 Key 不被覆盖；会话轮换只刷新插件自己的值；登出删除凭据、配置档与默认切换；用户 Key 及其配置档在登出后保留；损坏会话保留上一次状态；非官方默认与其他提供方的已配置 Key 都会阻止切换；已存在的配置档永不被删除；重复轮询幂等。`tests/settings-integration.spec.ts` 通过真实设置服务写入配置档，再经真实适配器解析，证明路由可服务且带有随包模型目录；`tests/plugin.spec.ts` 覆盖插件的服务接线与销毁。`packages/bundle/web-app/tests/birdcoder-default.spec.ts` 固定随包配置档、BirdCoder 默认值与默认模型在解析后中转路由上的存在；「模型」设置与模型选择客户端套件固定 BirdCoder 优先的提供方顺序。
