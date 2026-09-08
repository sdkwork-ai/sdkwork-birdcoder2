# Agent Note: Markets 模式页面新增插件 tab 与对话执行的添加入口

Status: implemented

[English](2026-09-07-markets-mode-plugin-plugins-tab-and-add-flows.md) | 中文

## 问题

Markets 模式插件（`ui-sdkwork-markets`）首次落地它的第一个界面：keyed 的 `mode.page` 页面，页头承载分类 tab。分类里缺了插件，也没有任何入口承载市场需要的两个用户故事：通过引导式、技能驱动的对话创建插件，以及录入第三方插件市场的来源信息。完整改动（四个 tab、添加下拉、录入弹窗、页面派发）曾构建过一次，随后被后来的 workspace 变更回退：CSS modules、README、帧 `AppModeId` 联合中的 `markets` 模式 id、bundle 接线（web-app patch 清单与依赖、desktop 依赖、TypeScript paths）全部消失，而 TSX 源码与行为规格测试幸存。

## 决策

`markets` 模式 id 加入帧的 `AppModeId` 联合（紧邻 `drive`/`assets`），共享应用头记录其标题（`mode.markets`），因为其模式标题键映射是对非 code 模式的穷举记录。页头渲染四个分类 tab，插件在前；插件 tab 的头部工具把惰性的我的目录入口替换为添加触发器，其菜单承载两条流程：

- **创建插件** 通过页面的 `dispatchPrompt` 注入派发一条 locale 属主的创建提示词（`prompt.create`），引导代理运行其可用的插件创建技能。
- **添加插件市场** 打开录入弹窗，记录市场来源——来源（GitHub `owner/repo`、Git URL 或本地文件夹）、可选 Git 引用、可选稀疏检出路径——并把一条合成提示词通过同一派发提交。

`dispatchPrompt` 是两条流程的唯一执行通道，因为 harness 尚无可直接调用的宿主市场 API：它把框架切到 `code` 模式、运行共享的新会话流程、（有界 15 秒）等待列表 store 落地新的当前会话，再把合成提示词作为一条排队文本轮发送。没有会话落地时框架停留在会话界面，由用户直接操作。页面保持公共（无 IAM 会话面），弹窗对空引用/稀疏字段使用 locale 属主的回退文案，每个面板在各自真实目录界面上线前仍渲染空状态提示。

回退修复属于本 note 的范围：四个 CSS module 由已构建产物重建，接线行恢复到兄弟模式包使用的同一位置（web-app `cordis.patch.yml` 插件与依赖、`apps/desktop` 依赖、`tsconfig.base.json` paths），并为 `ModeIconProps` 类型导入声明 `@deepseek-ai/dsh-client-ui-sdkwork-app-modes` 为 peer/dev 依赖。

## 备选方案

**注册模式栏条目。** 否决：市场界面通过侧边栏快捷入口（新会话区域）可达，模式栏保持 SDKWork 主模块集；模式栏条目以后无需契约变更即可加入。

**让弹窗把市场条目直接持久化到本地。** 否决：本地持久化需要一个当前没有包提供的服务属主 store，而会话通道让添加行为在会话转写中可审计；后续直接 API 无需改表单即可取代派发。

**把创建流程接成 composer 斜杠命令。** 暂缓：斜杠管线存在，但创建流程需要可见的合成提示词，并与添加市场流程保持对称；命令界面以后可在同一派发之上叠加。

## 后果

添加入口的结果（成功与失败）呈现在会话转写中，而非页面状态。插件添加触发器只挂在插件 tab；其余 tab 在账户操作落地前保留惰性的我的目录按钮。未来的目录界面按分类作为各自 provider 落地，无需触碰 header shell；`MarketsPageInjected.dispatchPrompt` 是它们复用于安装类动作的扩展点。
