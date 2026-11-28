---
description: "SDKWork 技能页的 Host 半边：SkillHub 目录代理，以及由五条仅限 owner 的 webServer 路由提供的本机技能安装器（安装、启用、停用、卸载、上游详情）。"
kind: "package-reference"
---

# @deepseek-ai/dsh-sdkwork-skillhub

[English](README.md) | 中文

## 概要

`dsh-sdkwork-skillhub` 是 SDKWork 技能页（[`dsh-client-ui-sdkwork-markets`](../../client/ui-sdkwork-markets/README.zh.md)）的 Host 半边。
SkillHub 不返回 CORS 头，浏览器也写不了 Harness 技能根，所以两件事都放在这里：为页面的详情抽屉代理上游目录读取，并把目录技能的
真实文件安装到 `$DSH_HOME/skills`——内置技能 provider 本来就会扫描的根目录。安装规则与 SkillHub 市场一致：按版本固定的文件清单、
逐文件大小与 SHA-256 校验、全部通过后才换入暂存目录，以及把"启用/停用"实现为目录在启用根与本包停用根之间移动。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [模型体验](#model-experience)
- [已知限制与待办](#known-limitations-and-deferred-work)
- [开发说明](#dev-note)

<a id="use-this-package"></a>
## 使用本包

把它挂载到带有 `webServer` 的组合里；web-app 组合包已经这样做了，位置就在技能页浏览器半边旁边。所有路由都要求 owner Peer，
其他调用者一律收到 `403`：

| 路由 | 方法 | 用途 |
| --- | --- | --- |
| `/sdkwork-skillhub/api/installed` | GET | 启用根与停用根里实际存在的技能，附台账元数据。 |
| `/sdkwork-skillhub/api/install` | POST | `{ packageKey, version? }`——安装或更新一个技能。 |
| `/sdkwork-skillhub/api/uninstall` | POST | `{ packageKey }`——删除目录与台账记录。 |
| `/sdkwork-skillhub/api/enabled` | POST | `{ packageKey, enabled }`——在两个根之间移动目录。 |
| `/sdkwork-skillhub/api/detail` | GET | `?packageKey=&version=`——版本、安全报告与文件清单。 |

`packageKey` 是目录里的 `skillhub.<handle>/<slug>`。上游 handle 与 slug 都不允许 `/`，所以切分没有歧义；不带这个形状的 key 会
以 `unsupported-coordinate` 拒绝，而不是猜一个技能。

```yaml
- name: '@deepseek-ai/dsh-sdkwork-skillhub'
  config:
    apiBaseUrl: https://api.skillhub.cn
```

省略的根目录都落在 Harness home 下：启用根是 `$DSH_HOME/skills`，停用根与台账在 `$DSH_HOME/data/sdkwork-skillhub/`。

### 何时选择它

技能页需要真正安装技能、而不是只往云端技能库添加时选它。不要挂载两次：两个安装器会争抢同一份台账。

<a id="understand-the-implementation"></a>
## 理解实现

- `src/skillhub.ts`——上游客户端。它对每次读取设上限（单文件 16 MiB、单版本 256 MiB、2,000 个文件），拒绝可能逃出安装目录
  的路径，并把每个文件请求固定到清单版本。下载不带 `version` 会静默返回最新文件，从而在一个目录里混入不同版本。
- `src/installer.ts`——安装引擎。文件先写进目标旁的 `.staging-<uuid>`，按清单的大小与 SHA-256 校验，全部通过后才改名覆盖旧
  目录，改名失败会恢复旧目录。台账（Harness home 下的 JSON 文件）记录确切版本、文件数、字节数与安装时间；启停状态不写入台账，
  它就是目录位置，因此磁盘永远是事实。
- `src/index.ts`——插件本体：配置 schema、owner 校验、有上限的 JSON 请求体，以及每次变更后发一次 `skills/change`，让目录观察者
  无需重启就重新读取。
- `src/shared.ts`——通过 `./shared` 子路径与浏览器包共享的路由路径与传输类型。

<a id="model-experience"></a>
## 模型体验

无：本包不新增工具、提示词内容或会话事件。它写的是普通技能目录，所以模型看到的已安装技能与手写技能完全一样——在之后开始的
会话的技能清单里。

#### KV Cache 影响

无；本包写入的内容在下一个会话组装技能提示词之前不进入任何请求，这是既有 provider 的行为。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与待办

- **安装从下一个会话起可见。** 运行中的会话在开始时固定技能清单，所以安装后页面会提示需要重启，与 SkillHub 市场一致。
- **版本是逐次选择，不是自动升级策略。** 抽屉会列出上游版本并安装所选版本（包括旧版本）；不会自动升级。
- **安装时从 SkillHub 取文件。** `sdkwork-skills` 的镜像只带目录元数据，不带文件内容；不支持离线安装。
- **被清洗过的 package key 不可安装。** 上游 handle 或 slug 需要清洗（或 key 带碰撞后缀）的记录会被列出，但以
  `unsupported-coordinate` 拒绝，不做猜测。
- **本机导入只列出、不托管。** 用户自己拷进 `$DSH_HOME/skills` 的目录会出现在已安装列表中，没有版本与台账记录；启停与卸载
  仍然对它生效。

<a id="dev-note"></a>
## 开发说明

<details>
<summary>维护者工作背景——点击展开</summary>

安装器刻意复用 Harness 技能根而不是私有目录：文件系统 provider 通过 `SKILL.md` frontmatter 发现技能包，因此在这里安装的技能
会与手写技能并列出现，并在本插件被停用后继续存在。启用/停用因此在同一 Harness home 下的两个根之间移动整个目录，台账只是安装
元数据的缓存，而不是状态的权威来源。

路由选用同源 WebServer 路由而不是 Typert remote 方法，是因为浏览器侧是普通目录页面、载荷是文件形状的（详情、文件清单）；
共享常量让两半不会漂移，`tests/installer.spec.ts` 用固定上游覆盖了引擎，包括文件被篡改与暂存目录清理两条路径。

</details>
