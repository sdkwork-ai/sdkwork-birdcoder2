---
kind: upgrade-guide
description: "插件目录从 dshmarket 迁移到 SDKWork Plugins 数据库与 API。"
---

# 插件目录改由 SDKWork Plugins 提供

[English](guide.md) | 中文

## 变更

插件 tab 现在从 SDKWork Plugins App API 读取分类和插件记录。`dshmarket` 插件、它的 `market` 控制服务以及 Web 组合行均已移除。只存在于独立 dshmarket 部署中的目录数据不会自动复制到 SDKWork Plugins 数据库。每条目录记录携带一个或多个按优先级排序的安装目标（注册表包、发布归档、仓库路径）；没有目标的记录仍会显示，但没有安装操作，并会说明原因。

## 迁移

1. 从 profile 或 bundle 配置中移除自定义的 `dshmarket` 依赖和 `dsh-market` 组合行。内置插件页现在负责显示目录。
2. 在 SDKWork Plugins 仓库运行 `pnpm db:migrate` 应用数据库迁移，然后执行标准种子 profile。它会载入已发布的 dsh-market 目录及其安装目标、素材与能力披露；导入工具会记录来源版本与校验和，后续刷新可复现。
3. 升级后登录应用，确认目录从已配置的 SDKWork API 加载。确认目录记录经 Host 插件管理器安装到本机 profile，已安装记录显示已安装版本（目录发布更新的注册表版本时提供更新），没有安装目标的记录没有可用的安装操作。

不再需要配置 SDKWork 侧的安装接口或权限：目录只发布目标，安装、更新与卸载由客户端的 Host profile 执行。
