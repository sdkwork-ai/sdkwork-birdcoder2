# Agent Note: OEM 品牌拥有自己的 home 与应用身份

Status: implemented

[English](2026-10-29-oem-brand-home-and-identity.md) | 中文

## 问题

本仓库产出的两个 SDKWork 应用必须能并排安装、运行、更新与卸载，未来的 OEM 还要在不改外壳的前提下加入第三个。任何共用值都会破坏这一点：共用一个 `DSH_HOME` 会让两个品牌互相读取对方的会话、凭据、插件与工作区；共用一个 `productName` 会共用 userData、Chromium 单实例锁与日志目录，启动一个应用就会退出另一个；共用一个 URL scheme、命令名与 Windows PATH 归属键会让两个品牌互相抢注；共用一个更新缓存会让一个品牌安装另一个品牌的更新。外壳也无法从 `oem.json` 选择 home，因为该文件本身就在 home 里。

## 决策

`brands/<key>.json` 成为两个已安装品牌不能共用的每一项身份值的唯一归属：home 目录名、Electron 产品名与可执行文件名、URL scheme、桌面命令及其归属回执名、Windows 注册表键与互斥体名、更新缓存目录、产物前缀。`apps/desktop/scripts/brand-manifest.mjs` 负责校验，并拒绝上游身份（`~/.dsh`、`DeepSeek Harness`、`dsh`、`com.deepseek.harness`）。打包用 `DSH_BRAND`（或 `DSH_BRAND_CONFIG`）选择它，写成 `resources/brand.json`；若存在 `brands/<key>.oem.json`，则同时复制为 `oem.json`。electron-builder 的 `productName`、`extraMetadata.productName`、`executableName`、`artifactName`、协议、appId 兜底与更新缓存都由它派生。

`apps/desktop/src/brand.ts` 在外壳启动时读取该清单，解析出 `~/.<home.dirName>`，并在任何使用方解析 home 之前导出为 `DSH_HOME`——上游包仍然保留 `~/.dsh` 默认值，因为新值通过它们本就读取的环境变量到达。优先级为：显式 `DSH_HOME`、品牌 home、声明了 `home.adoptLegacyDshHome` 的品牌才考虑的旧 `~/.dsh`。打包后的首次启动会重命名旧目录；重命名被拒时退化为目录联接；两者都失败时本次启动继续使用旧 home 并报告。源码启动从不重命名，未声明该标志的品牌从不读取 `~/.dsh`。

## 考虑过的替代方案

**把默认值改到 `@deepseek-ai/dsh-home-paths`。** 否决：该包属于上游，且所有使用方都读它，合并会回退该改动，更糟的是同一个进程里可能解析出不同的 home。环境变量覆盖是已有文档化的接缝。

**把 home 名放进 `oem.json`。** 否决：`oem.json` 从 home 读取，该值必须在找到文件之前已知。清单必须位于 `DSH_HOME` 之外。

**让安装器通过快捷方式传 `DSH_HOME`。** 否决：任何一个漏掉的入口（托盘启动、协议激活、更新器重启、CLI 命令）都会静默使用错误的 home。

**复制而不是移动旧 home。** 否决：会话与附件很大，复制会翻倍占用磁盘，并留下两个会漂移的 home。重命名是同盘移动；被拒时用联接让两个名字都有效且不动数据。

**让所有品牌都能接管旧 home。** 否决：OEM 品牌会因此导入其他产品的凭据与会话。接管必须是清单中的显式标志。

## 后果

出厂品牌在首次打包启动时迁移到 `~/.birdcoder`，而 `npm dsh` 仍用 `~/.dsh`；希望两者共用 home 的用户显式设置 `DSH_HOME`。显示文案仍来自 `resolveDesktopLocale` 与 OEM profile，因此 `brand.name` 与清单的 `displayName` 可以不同——清单管身份与路径，OEM profile 管端点与面向用户的品牌文案。

图标、安装器文案与原生窗口字符串仍是构建期资产：OEM 构建必须像现在一样替换位图，`brands/README.md` 记录了该限制。新品牌还需要一个与其 `executableName` 同名的可执行文件，electron-builder 由同一字段派生出它。
