# Agent Note：由 SDKWork Plugins 管理插件市场

Status: implemented

[English](2026-11-24-sdkwork-plugins-marketplace.md) | 中文

## 问题

插件页面需要一个由 SDKWork Plugins 管理记录、分类、精选排序、素材、能力披露和安装目标的目录。嵌入式市场插件在现有数据模型之外维护了第二套目录和安装界面；本仓库的第一版落地方案把目录记录当成需要「连接」的对象，而不是要安装到本机 profile 的软件包。

## 决策

SDKWork Plugins 在自己的 PostgreSQL 模块中管理插件市场数据。一条目录记录携带注册表身份（`catalog_provider` + `catalog_url`）、多语言文案、所有者、包与仓库事实、采集时的热度窗口、弃用状态、素材行、能力与红线行，以及一个或多个有排序、且恰好一个默认值的安装目标。`marketplace_metadata_json` 保留注册表投影以兼容后续字段，注册表中仅用于展示的 `install` 文本永不作为安装目标。

`ai_plugin_install_target.target_spec` 就是 Harness 插件管理器接受的字符串：`<package>@<version>`、`archive+<url>`、`git+<url>.git#<ref>&path:/<directory>`。导入工具按 dsh-market 的选择顺序推导目标（先注册表包、再属于该条目仓库的发布归档、最后仓库路径），因此 12,961 个已发布条目全部有安装目标。PostgreSQL 迁移 `0005_plugin_catalog_completeness` 升级已有数据库；合并后的基线包含相同的终态。

SDKWork Plugins 的 PC 市场包负责市场页面。它按记录渲染卡片，并给出真实安装状态、安装操作、Host 能按目录版本更新注册表包时的更新操作、已安装依赖的卸载操作，以及操作不可用的原因。BirdCoder 的 `ui-sdkwork-markets` 导入该包，并提供生成的 App SDK 客户端、语言、宿主主题与 Host 插件管理器连接：优先安装目录记录自己的目标，服务端安装计划覆盖旧版本目录记录，导入投影是最后的兜底。Git 规格会固定到提交，同时保留目录中的子目录；GitHub API 不可达时保持规格不固定，而不是拒绝安装。

已安装列表继续以 Host profile 为准，而不是目录级可用状态。目录记录按注册表包名，或按 profile 保存的 Git 源地址匹配已安装依赖；已安装的注册表包低于目录版本时报告为可更新。

Web 组合不再挂载或构建 `dshmarket` 插件。插件 tab 进入 SDKWork Plugins 目录；官方和已安装视图继续使用 Host 插件 store 与插件配置 slots。

## 考虑过的替代方案

**继续让 `dshmarket` 插件管理目录。** 这能保留其独立目录和安装生命周期，但插件页会继续读取 SDKWork Plugins 数据库之外的数据，并维护第二套市场集成。

**在 BirdCoder 内重建目录和数据库访问。** 这会在宿主应用里重复实现 SDKWork Plugins 页面和 API 客户端行为，使权威 schema 与 UI 分属不同仓库。

**把目录可用状态当作用户已安装状态。** 目录记录按共享可见范围管理；Host profile 才拥有已安装插件树，并继续作为已安装列表的数据源。

**只在请求时推导安装目标。** 服务端每次请求重新推导既无法建索引、无法用 SQL 测试，也会让每个客户端各写一套规则；存下有排序的目标只保留一个权威，并让市场页面不再猜测「能不能装」。

## 后果

目录内容和精选配置由 SDKWork Plugins 数据库、API 与生成 SDK 管理。运营方发布的目录记录至少带一个安装目标；没有目标的记录仍可浏览，但没有安装操作，并会说明原因。安装、更新与卸载都经 Host profile 执行，因此市场不会声称一个 Host 并不存在的安装。

初始化数据现在包含 dsh-market 的全部已发布条目（12,961）、两种活动语言下的 23 个分类标签、21,806 个安装目标、11,570 行素材和 39,906 行能力披露。目录种子在单个事务内执行、幂等，并已在 PostgreSQL 16 上验证；标识由目录 URL 推导，重新导入时每条记录的 id、uuid 与 plugin key 保持不变。

移除 `dshmarket` 后，其子模块、workspace 包依赖、Host 构建步骤与 `market` 控制契约也一并移除。未来独立的 SDKWork Plugins PC 应用可以消费同一个页面包，BirdCoder 是该包当前的 PC 宿主集成。

## 验证

`sdkwork-plugins` 验证 PostgreSQL 基线与迁移链、Rust 仓储与 API 行为、生成的 App 与 Backend SDK，以及目录导入。目录种子已在 PostgreSQL 16 实例上执行：12,961 条目录插件、每条恰好一个默认安装目标、11,570 行素材、39,906 行能力披露，第二次执行行数不变。`tools/import_dsh_market_catalog.test.mjs` 覆盖目标优先级、目录顺序变化下的稳定标识、标识宽度与生成的语言种子。

BirdCoder 通过 SDKWork Plugins App SDK 验证市场页面，用 `pluginInstallation.ts` 把目录记录与 Host bundle 列表关联，固定 Git 规格时保留目录子目录，并把 Host 失败码映射为本地化文案。该包的客户端测试覆盖安装、更新与卸载路径。

`sdkwork-plugins` 的 PostgreSQL 集成检查仍需要 `SDKWORK_PLUGINS_POSTGRES_URL`；持续集成环境没有数据库，会跳过这些检查。
