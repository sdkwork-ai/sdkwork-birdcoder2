# Agent Note: SDKWork 应用商店模式集成

Status: implemented

[English](2026-08-17-sdkwork-appstore-mode-integration.md) | 中文

## 问题

应用商店模式栏图标需要在 BirdCoder 中打开 SDKWork 商店。私有 SDKWork PC 应用持有 router、认证外壳、主题 provider、全局 alias 与私有 workspace 包；BirdCoder 则已持有模式导航、部署配置、认证、语言和浏览器插件加载。

## 决策

`@deepseek-ai/dsh-client-ui-sdkwork-appstore` 是[应用模式栏](2026-08-16-sidebar-app-modes.md)中的独立模式插件。它持有应用商店字形与文案，注册 keyed 的 `appstore` 模式栏条目和页面，并使用 layout store 现有的模式操作。选择应用商店仍属于瞬时 layout 状态，不添加浏览器路由或持久化偏好。

插件使用生成的 `@sdkwork/appstore-app-sdk` 客户端，而不嵌入私有 PC 应用。适配器从 `ctx.env` 读取活动 API 基础 URL 与静态 access token，仅在环境 token 为空时采用 `ctx.iam` 会话 token，并把宿主语言映射为 SDKWork 目录语言。Discover snapshot 包含启动首页的必备应用、精选应用、分类、专题合集、编辑精选、最近更新、推荐与活动区块。搜索和分类选择使用独立结果视图，并通过 keyed page 注入同时转发 query 与 category id。

环境、凭据、语言与资源释放变化会递增请求版本；较早版本的响应不能覆盖当前状态。各个商店请求可以单独失败，因此成功区块仍会显示。只有所有商店数据源都不可用时服务才报告错误；成功返回但没有内容时页面显示专用空态。

## 类型与 bundle 集成

声明发射把 SDKWork 导入解析到包内声明门面。单独的 no-emit TypeScript 项目用所消费的 SDKWork 源码路径替换这些门面 paths；浏览器 bundle 使用同一组真实源码映射内联生成客户端，无需预先构建 sibling 产物。发布的插件声明固定版本的公开 SDKWork 可选依赖，不暴露私有 workspace 包。

## 备选方案

| 已拒绝 | 原因 |
|---|---|
| 挂载私有 SDKWork PC 应用 | 它的 router、认证外壳、主题所有权、alias 与私有依赖闭包和 BirdCoder 的 keyed 页面及宿主持有服务冲突 |
| 让应用商店继续作为 `ui-sdkwork-app-modes` 占位页 | 外壳包会因此持有 SDKWork 业务行为与凭据，而不是由功能自身持有条目和页面 |
| 在 `packages/client` 下创建私有门面包 | 每个包目录都是 release member；私有包会违反发布约束，而本地声明门面已经隔离声明发射 |
| 新增应用商店专用环境或认证设置 | `ui-sdkwork-env` 与 `ui-sdkwork-iam` 已持有部署与身份；复制状态会在环境切换和退出登录时产生分歧 |
| 在凭据或语言变化后仍接受旧响应 | 旧请求可能发布为其他身份或语言获取的数据 |

## 后果

点击应用商店图标会用 SDKWork Discover 页面替换代码会话，切回代码则恢复工作台。该集成复用 BirdCoder 的部署、身份、语言与 keyed 模式组合，不导入私有 PC 应用。SDKWork 商店请求仍是浏览器流量，不会添加 Harness 提示词内容、工具、会话事件或 KV Cache 输入。

页面目前只提供发现、搜索与分类筛选。它依赖已配置的 SDKWork API 以及该部署接受的凭据；生成客户端会在网络分发前拒绝受保护的匿名请求。应用详情、安装、购买与应用管理仍不属于此次集成。

## 验证

服务测试覆盖商店映射、专题排序、精选与合集缺失 id 回查、局部接口失败、全部数据源失败、query/category 结果、凭据优先级、语言失效与旧请求。页面测试覆盖 idle 加载、配置状态、Discover 各区块、分类转发、搜索规范化、空结果和返回 Discover。apply 与模式栏测试覆盖 keyed 注册、延迟 slot 声明、导航与 teardown。assembled web 模式测试继续覆盖 keyed 页面选择与匿名无网络行为；源码类型检查与包 bundle 检查覆盖生成 SDK 客户端集成。
