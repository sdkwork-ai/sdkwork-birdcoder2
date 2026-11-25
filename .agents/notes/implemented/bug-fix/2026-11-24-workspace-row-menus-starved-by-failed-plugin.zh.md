# Agent Note：工作区行菜单被失败插件饿死

Status: implemented

[English](2026-11-24-workspace-row-menus-starved-by-failed-plugin.md) | 中文

## Problem

侧边栏的工作区（项目）行与会话行丢掉了全部路径操作——打开文件夹、复制路径、在终端打开——连同发布行一起消失，只剩重命名与删除工作区。这些行已静默回退到上游内置菜单。

根因是必需的 inject 链，而不是菜单代码本身。`ui-sdkwork-workspace-row-menus` 声明了 `sidebar.workspaces.rowMenus` 渲染器，并把 `workspaces`、`sessionLogDownload`、`deployPublish`、`remote`、`remote.sdkworkAppBuild` 列入 cordis 的 `inject`。inject 未满足的插件会一直 pending，于是该槽位没有任何占据者。`ui-sdkwork-deploy` 开始向根作用域的 `settings.dns` 注册一个弹窗，而 `ui-sdkwork-dns` 早已拥有这个单座；槽位注册表拒绝第二次注册，deploy 的 fiber 因此失败，`deployPublish` 永远不出现，行菜单插件也就永远不激活。整个过程没有任何用户可见的错误：空槽位只是渲染了上游菜单。

组装后的 Web 客户端复现了它。浏览器控制台带有 `ui-sdkwork-deploy: failed: Error: single slot "settings.dns" already has a registration at priority 0`，右键项目行只列出重命名与删除工作区。

## Decision

**行菜单只要求槽位注册表与词典。** 每个动作服务与点号命名的 `remote.sdkworkAppBuild` 命名空间都在槽位的渲染期 inject 闭包里用 `ctx.get` 读取。后注册的插件在下一次渲染时提供自己的行；失败的插件只移除自己的行（发布、编译/打包、导出），而不是整份菜单。

**`settings.dns` 只有一个所有者：`ui-sdkwork-dns`。** 它的弹窗是长期存在的域名管理界面（根域名、子域名归属校验文件、DNS 解析记录、云账号同步）。重复的 `DomainCenterDialog` 及其辅助模块、locale 键与 spec 已从 `ui-sdkwork-deploy` 删除；deploy 插件重新加载，其既有界面随之恢复。

## Alternatives considered

**把可选服务继续留在 `inject` 里，只修槽位冲突。** 这样能恢复今天的菜单，但会为任何未来依赖重复同一种失败：一个无关插件失败又会无提示地移除路径操作。

**让 deploy 的弹窗以不同优先级遮蔽 DNS 弹窗。** 单座上的两个注册会让其中一个实现永远不可达，而且仍让一个域名入口代表两个不同产品。单座是有意为之；若真需要第二个功能，它应拥有独立座位。

**为 deploy 的域名中心新增第二个设置菜单行。** 它会与域名管理入口重复，还需要新的设置座位与文案；在「域名中心」与「域名管理」确实需要分开之前暂缓。

## Consequences

打开文件夹、复制路径、在终端打开、发布应用、发布为脚手架、从脚手架安装重新出现在省略号触发器与行右键菜单中。deploy 插件的发布流程与设置界面恢复工作，域名管理保持单一所有者。

行菜单现在每次渲染做几次 `ctx.get` 查询，而不是在激活时一次性捕获服务；在插件之后才注册的服务无需刷新即可出现。代价是损坏的可选服务不再表现为菜单缺失，而是逐行降级。

插件 spec 在没有可选服务的情况下启动插件体，并断言渲染器仍占据该槽位。组装后的 Web e2e 右键列出了三个路径行与三个发布行；context-menu 金样现在记录 fork 菜单而不是内置菜单。该修复需要重新构建客户端 bundle；已安装的包不会拾取源码改动。

上游的「标为已读 / 标为未读」行是共享右键菜单的贡献，而本插件整体替换了会话菜单，因此 fork 的会话菜单从未包含该行。恢复菜单不会改变这一既有差异。
