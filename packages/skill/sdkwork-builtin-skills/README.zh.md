---
description: "随包分发的 BirdCoder 场景技能根：让输入框标签条插入的 `/birdcoder-…` 令牌成为桌面端与浏览器端会话中真实、可点开的技能。"
kind: "package-reference"
---

# @deepseek-ai/dsh-sdkwork-builtin-skills

[English](README.md) | 中文

## 概述

点击 BirdCoder 标签条会把 `/birdcoder-…` 名称写入输入框，而这些名称只有在技能目录能应答它们时才表现得像技能。启用这个根之后，全部 35 个场景技能在桌面端与浏览器端 profile 中都能解析：每个令牌都会装饰成引用、在右侧边栏打开其指令文件、并在提示以它开头时注入该正文。自带同名技能的工作区仍然优先。若部署需要自己的名称，请改为新增技能目录。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

该插件不接受任何配置。随包分发的 `dsh-web-app` 补丁插入它的合成行，因此浏览器 profile 与叠加在同一 web bundle 之上的桌面 profile 都会挂载它。

### 随包根提供什么

- **35 个场景技能。** `birdcoder-agent-app`、`birdcoder-android-app`、`birdcoder-business-plan`、`birdcoder-cicd`、`birdcoder-codex-plugin`、`birdcoder-courseware`、`birdcoder-daily-dev`、`birdcoder-docs`、`birdcoder-dsh-plugin`、`birdcoder-flutter-app`、`birdcoder-harmonyos`、`birdcoder-html-web`、`birdcoder-image`、`birdcoder-ios-app`、`birdcoder-lesson-plan`、`birdcoder-marketing-poster`、`birdcoder-meeting-notes`、`birdcoder-miniprogram`、`birdcoder-music`、`birdcoder-poster`、`birdcoder-ppt-design`、`birdcoder-product-ppt`、`birdcoder-react-web`、`birdcoder-short-video`、`birdcoder-skill-dev`、`birdcoder-sound-effect`、`birdcoder-tts`、`birdcoder-uniapp`、`birdcoder-unity-app`、`birdcoder-video`、`birdcoder-visual-poster`、`birdcoder-vue-web`、`birdcoder-web-dev`、`birdcoder-workbuddy-app`、`birdcoder-workbuddy-plugin`。每个技能是一个目录，内含带 `name` 与 `description` 前置元数据的 `SKILL.md`。
- **每个技能的绝对指令路径。** 目录会把随包的 `SKILL.md` 路径转发给客户端，输入框据此在右侧边栏预览该技能的指令。

### 可观察的成功与失败

挂载该行后，每个随包名称都会出现在 `/` 菜单中，输入框里的 `/birdcoder-…` 令牌会装饰成引用，点击该引用会打开随包的 `SKILL.md`。缺少该行时，对任何不是本仓库的工作区，技能目录都是空的：`/` 菜单没有任何条目，令牌保持普通文字，点击也无处可开。由于该根是静态文件目录，发现总是完整返回整套随包技能；随包目录缺失或不可读时得到的是空目录，而不是部分结果。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部细节——点击展开</summary>

本节说明该 bundled 根是如何接线的；可观察行为已在[使用本包](#use-this-package)中完整覆盖。

### 设计理念

该插件是普通目录提供方之上的薄适配层，而不是第二套发现实现：它从 `import.meta.url` 解析出自己的 `assets/skills` 目录，并以关闭默认根与文件监视的配置挂载共享的文件系统提供方。它只贡献一个 bundled 等级（600）的根，因此前置元数据解析、等级优先级、以及绝对的 `SKILL.md` 路径都与项目或用户目录完全一致。项目根与用户根因此仍然优先于这些副本，部署自己的提供方行也继续拥有本地发现。

### 源码地图

| 文件 | 角色 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：解析随包根，挂载一个 bundled 目录根 |
| [`assets/skills/`](assets/skills) | 每个随包技能一个目录，各自持有宿主注入的 `SKILL.md` |
| — | 不随包发布运行时不变式伴随文件；注册唯一性与生命周期由技能注册表负责，随包技能集合由本包规格断言。 |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

当包级约定不够用时，请阅读以下页面。它们从本根注册到的注册表出发，一路说明技能如何到达模型，再回到输入框。

- [skill 子系统参考](../../../docs/subsystems/skills.zh.md)——注册表、提供方约定、本地发现优先级，以及目录与工具。
- [skill-filesystem 包](../skill-filesystem/README.zh.md)——本根复用的目录提供方，包括它占用的 bundled 等级。
- [tool-skill 包](../tool-skill/README.zh.md)——目录条目如何到达会话目录与模型，以及行首 `/name` 如何注入正文。
- [skill-badge 包](../skill-badge/README.zh.md)——另一个 bundled 提供方，也是“一个固定虚拟技能”的最小示例。

-----

<a id="model-experience"></a>
## 模型体验

间接地，经由 `dsh-tool-skill`，由它把提供方的目录条目与所选正文渲染给模型。

#### KV Cache 影响

在随包分发的 Web 与桌面合成中处于启用状态，因此每个会话的请求前缀都带有本根贡献的 35 条目录条目；加载某个技能时会在工具结果渲染处插入该技能的正文。优先级意味着同名的项目、自定义或用户技能会替换目录与前缀中的随包条目，而随包条目本身只在发版时变化。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>


这些限制界定了该 bundled 根不做的事情。它们是当前包约束，不是待办清单。

- **固定的随包集合**——该根恰好贡献本次发布随包的 `birdcoder-*` 技能；需要其他场景技能的部署应当新增技能目录并加上自己的标签，而不是修改这里的资产。
- **正文仅英文**——技能指令为英文，与仓库中其他技能正文一致。旁边的标签文案在客户端包中已本地化，因此本地化标签可能指向英文正文。
- **同一份技能文本存在两份副本**——撰写副本位于仓库的 `.agents/skills/`，以便仓库内的会话与其他 agent 工具继续发现它们；任一随包副本与撰写源漂移时，本包规格会失败。
- **按设计处于最低优先级等级**——bundled 等级低于项目根、自定义根与用户根，因此自带 `birdcoder-*` 技能的工作区会静默赢下该名称；变化的只是目录条目，不是随包文件。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

新增一个场景技能共四处改动：撰写 `.agents/skills/<name>/SKILL.md`，复制到 `assets/skills/<name>/`，在 `packages/client/ui-sdkwork-app-modes` 的 `SCENE_SKILLS` 中加上标签及其文案，并把名称加入本包规格中的 `SHIPPED_SKILLS`。标签条只渲染空白阶段的会话，因此已有轮次的会话完全不会显示标签。

</details>
