# Agent Note: 发布与安装是相互独立的模板弹窗

Status: implemented

[English](2026-11-13-independent-template-publish-install-dialogs.md) | 中文

## Problem

最初的模板中心把发布与安装放在同一个带页签的弹窗里。外壳同时持有两套状态，发布页签通过条件渲染挂载安装面板，安装面板虽然自己读取目录，却共享发布弹窗的关闭、账号和登录门逻辑。结果是两半无法独立演进：发布向导的改动可能重挂或重置安装页签，安装流程继承发布专属的关注点，发布结果底部还能切进一个本质上是第二产品区的安装界面。行菜单只暴露一个含糊的 `openTemplate({ tab })` 能力，提供方要实现两半才能提供任意一半。

## Decision

发布与安装成为两个弹窗、两个流程和两个可选服务方法。

- `deployPublish.openPublishTemplate({ defaultDirectory })` 挂载 `PublishTemplateFlow` → `TemplatePublishDialog`。弹窗持有应用/自定义目录扫描、平台应用与模板去重、三步向导、逐行发布运行和发布结果账本；不导入任何安装模块。
- `deployPublish.openInstallTemplate({ defaultDirectory })` 挂载 `InstallTemplateFlow` → `TemplateInstallDialog` → `TemplateInstallPanel`。弹窗只负责登录/外壳接线；面板持有我的模板/市场目录、目标选择、安装运行与逐行安装反馈；不导入任何发布模块。
- 行菜单只在对应服务方法存在时展示对应动作（`openPublishTemplate` → 发布为模板，`openInstallTemplate` → 从模板安装），组合可以只提供其中一个。
- 发布结果账本不再提供「去安装」切换。安装从自己的行菜单动作进入，而不是发布表面的一种模式。

两个弹窗只共享两个下层部件：

1. `TemplateDialogFrame` —— 模态外壳、账号芯片、关闭/Escape/busy 处理与登录门。它不读取任何发布或安装状态。
2. `useTemplateHostSession` —— 构造 deploy 客户端并读取 IAM 账号，在宿主通知时刷新。它不读取任何流程的勾选、目录或运行状态。

`TemplateDialog.module.css` 继续作为外壳与两个表面基础控件的共享设计 token 样式表；各面板保留自己的布局类与状态。服务仍用一个隔离 React root 做模态销毁，但打开任一弹窗都会替换另一个，因为屏幕上只会有一个模态。

## Alternatives considered

- **保留页签并按页签隔离状态。** 否决：外壳仍持有两套生命周期，发布结果仍能切换表面，服务能力仍是一个含糊方法；两个产品会继续偶然共享关闭路径与登录门，而不是通过明确的基础部件共享。
- **两个弹窗各自实现遮罩/头部/账号芯片。** 否决：会重复焦点、Escape、busy、登录门与账号芯片行为，并让两个表面漂移。无流程状态的展示外壳才是低耦合的共享件。
- **两个流程共用一个 controller/hook。** 否决：共享 controller 会以另一个名字重建耦合。真正共同的部分只有宿主客户端/账号绑定。
- **发布结果也提供安装入口。** 本次拆分否决：那会让发布弹窗再次依赖安装流程。行菜单才是安装入口。

## Consequences

- 每个弹窗只读取自己的目录：发布读取平台应用、模板、分类与应用扫描；安装读取模板/市场与安装目标。两者不能重置对方的勾选。
- 只实现 `openPublishTemplate` 的提供方只显示发布行；只实现 `openInstallTemplate` 的只显示安装行。头部弹窗仍是应用清单。
- 安装弹窗仍通过共享外壳要求 IAM 用户会话。它现在把自己的逐行运行 busy 状态回传给外壳，安装进行中关闭/Escape 会被锁定，与发布运行中的行为一致。
- 共享外壳的焦点、Escape、关闭与登录门只有一份实现；流程专属文案、标题与主体仍在各自弹窗。
- 面板与 CSS 命名现在反映安装（`TemplateInstallPanel`、`TemplateInstallDialog`）；旧的合并式 `TemplateCenterDialog` 与页签标记已删除。

## Verification

- `template-publish-dialog.client.spec.tsx` 固定仅发布弹窗：没有安装页签与安装文案，覆盖发布运行、自定义目录、手动类型、重试与重置。
- `template-install-dialog.client.spec.tsx` 固定仅安装弹窗的标题与登录门，不出现发布表面。
- `template-install-panel.client.spec.tsx` 用桩客户端驱动真实安装链；发布弹窗测试从不挂载安装面板。
- `publish-template-flow.client.spec.tsx` 固定发布流程的 IAM 迟到水合与标题。
- `template-source.client.spec.ts` 固定服务的 `openPublishTemplate`/`openInstallTemplate`/`installTemplate` 表面。
- `row-menus.client.spec.tsx` 固定每行只调用自己的方法，缺少两个方法时隐藏两行。
