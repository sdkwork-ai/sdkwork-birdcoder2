# Agent Note：插件市场默认随应用提供

Status: implemented

[English](2026-11-02-plugin-market-ships-by-default.md) | 中文

市场的数据和页面归属见[由 SDKWork Plugins 管理插件市场](../architecture/2026-11-24-sdkwork-plugins-marketplace.zh.md)。

## 问题

插件 tab 是产品进入可安装插件的入口。让这个位置停留在安装提示，会使目录功能依赖一个可选插件包，也让产品缺少明确的目录责任方。

## 决策

每个出货的 Web 和桌面组合都无需单独安装市场插件，即可在插件 tab 打开 SDKWork Plugins 市场页面。页面包由 `sdkwork-plugins` 管理，并由 BirdCoder 的 `ui-sdkwork-markets` 接入。页面通过生成的 SDKWork Plugins App SDK 读取分类和插件记录；目录数据以 SDKWork Plugins PostgreSQL 模块为准。

数据库保存分类和插件的多语言文本、图标、使用量、精选排序与文案，以及可选的 Git 或 Drive 制品来源。缺少来源的目录记录仍可发现，但没有连接操作。带来源的记录会进入 Host 现有的检查、批准和 profile 安装流程。已安装视图读取 Host profile，不根据目录可用状态推断安装状态。

旧 `dshmarket` 插件和它的 `market` 服务不属于 Web 组合。市场包自带页面和目录服务，BirdCoder 提供 SDK 客户端、共享语言、导航和 Host 安装回调。完整的数据与来源映射契约记录在[架构说明](../architecture/2026-11-24-sdkwork-plugins-marketplace.zh.md)。

## 后果

运营方通过 SDKWork Plugins Backend API 管理唯一目录。该数据库的已有记录会由新增 PostgreSQL 迁移补上多语言元数据和使用量；只存在于独立 dshmarket 部署中的记录不会自动导入。目录级 `installStatus` 描述共享记录，不代表某个用户已安装的插件树。

插件 tab 由随应用出货的 UI 包提供，因此 Web 和桌面 profile 都能访问，而无需启用可选市场 bundle。Host 插件 store 继续管理已安装、官方插件和插件配置视图。

## 验证

SDKWork Plugins 检查数据库基线与迁移、Rust 持久化和 App/Backend API 契约，以及生成的 TypeScript SDK。它的 PostgreSQL 实库迁移检查需要 `SDKWORK_PLUGINS_POSTGRES_URL`。

BirdCoder 检查 Web 组合包含 `ui-sdkwork-markets` 且不再包含 `dshmarket`，并确认市场使用生成的 App SDK 和 Host 插件管理器安装流程。

## 考虑过的替代方案

**保持插件 tab 按需安装市场。** 这避免向不使用插件的部署提供目录 UI，但产品的插件入口会一直显示安装提示，而不是可浏览的目录。

**保留 `dshmarket` 作为必需包。** 它提供完整的市场 UI 和安装体验，但会在 SDKWork Plugins 数据库之外保存目录记录，并需要另一套契约和运行时集成。

**在每个 profile 中选择市场 bundle。** 这会把目录绑定到用户 profile 数据，已初始化的 home 还需要升级时改写 profile 才能获得市场。随应用出货的 UI 页面可以让目录由应用组合统一提供。

**使用云端应用商店的插件目录。** App Store 插件货架并不是 SDKWork Plugins registry，也不负责该数据库中的目录记录和制品来源。
