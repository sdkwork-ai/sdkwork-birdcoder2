---
description: "SDKWork 模板安装 Remote：在调用方选定目录下做含落点约束检查的有界项目文件写入"
---

# @deepseek-ai/dsh-api-sdkwork-template-install-controller

[English](README.md) | 中文

## 概述

`sdkworkTemplateInstall` 命名空间的宿主 Remote 持有者：唯一动词 `writeFile`，携带绝对目标目录、目标相对路径与 base64 内容。线上层拒绝不干净路径（段内分隔符、`..`、Windows 保留设备名、以点/空格结尾的段）、非 base64 内容以及超过 32 MiB 线上限的载荷；其背后的 `sdkwork-template-install` 能力会复查落点约束并按需创建父目录写入。浏览器的模板安装规划器（`ui-sdkwork-deploy` 的 `templateInstall.ts`）驱动这些写入。

## 已知限制与后续工作

- 每次调用写一个文件；若模板普遍携带数千文件，后续可加分块归档动词（begin/push/finish）。
