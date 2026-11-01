# BirdCoder 更新日志

本文件只记录**当前版本**——`##` 标题就是本次发布打的 tag，不累积历史版本条目；往期条目随各自版本的提交保留在 git 历史里（`git log -p CHANGELOG.md`）。「上游变更」逐字摘自上游该 release 的官方 Release notes（中文部分，英文版见各 Release 页面）；「BirdCoder 本地修改」记录 fork 在该版本上的自有变更（SDKWork 组件、品牌、打包与部署等），不受上游发布节奏影响。

## 0.2.2-alpha.4（fork 发布 2026-11-02）

本版本打在 `birdcoder-v0.2.2-alpha.3`（`e5a6ba8640`）之后，无上游同步窗口：包含该 tag 之后到 `a7b478f0b2` 的全部 fork 自有变更——IAM 账号模型供给、persona 账号资料、内置 MCP 连接器与技能市场插件、打包凭据投影修复；`plugins/dsh-im` 前进到 `dd500d24`（v5.9.1）。

### BirdCoder 本地修改

#### 功能

* **IAM 账号模型供给（birdcoder-account）**：新增 `packages/credentials/birdcoder-account` 凭据包——按账号维度供给模型访问，配套插件注册、设置集成与运行时单测；`apps/desktop` 侧补齐 IAM 深链与会话协议（`iam-deep-links.ts`、`iam-session.ts`、`iam-preload.ts`），桌面主进程、preload 菜单与平台抽象跟进。
* **persona 账号资料与角色个性化**：persona 角色与兴趣个性化进入客户端，账号资料面与 IAM 运行时打通（`iam-runtime` 的 token 存储同步、persona profile 读写复用同一传输层，不建第二套 client）。
* **内置 MCP 连接器**：`plugins/dsh-mcp-connector`（v0.2.92，自带 `lib/` 构建产物）作为 submodule 进入 fork，内置连接器面接入。
* **技能市场插件接入 skills 页签**：`plugins/dsh-skill-market`（v2.0.7）作为 submodule 进入，skills 页签内嵌技能市场。
* **relay 模型改从 SDKWork 目录中继**：新增 `scripts/generate-sdkwork-relay-models.mjs`，`llm-pi-ai` 的 `relay-models.generated.ts` 改由 SDKWork 模型目录生成。

#### 修复

* **打包凭据投影**（`f88df427dc`）：打包只投影已配置的 SDKWork 凭据，按分发类别（`deployment` / `public`）决定是否携带，不再在打包窗口内顺手签发令牌。
* **引导凭据私有化**（`62cbdce890`）：bootstrap 凭据收进用户私有 bundle，不再落在检出目录。
* **签名缓存 fixture 隔离**（`48ee68039a`）：把签名缓存 fixture 移出检出目录，避免打包窗口内检出被污染。
* **菜单快照跟上 BirdCoder 产品名**（`0117f15874`）。

#### 依赖与版本

* `plugins/dsh-im`：`4ef05eb`（v5.9.0+10）→ `dd500d24`（v5.9.1）——DS Bot 绑定模型变更后默认推理档位上报修复、提示词交接去重、Telegram 动作卡 429 重试与共享按钮文案净化、非 IM 轮次投递到绑定会话、DS Bot 会话同步回复去重（自带重建后的包产物）。
* `plugins/dsh-better-sidebar` 维持 dev `bd6cfa5`、`plugins/dsh-skill-market` 维持 `4cda930`（v2.0.7）、`plugins/dsh-mcp-connector` 维持 `0aaf140`（v0.2.92），均已是各自跟踪分支的最新提交。
* SDKWork 发布车道依赖维持 `scripts/sdkwork-sources.manifest.json` 与 `agent.workflow.json` 的双记录 pin（本地相对路径工作区、发布按 pin 克隆 git 仓库），本版本未前进 pin。
* 版本号同步推进到 `0.2.2-alpha.4`（450 个 released manifest，`verify-version-sync` 通过）。
