---
description: "SDKWork 模板安装能力：在调用方选定的目录下做有界、含落点约束检查的项目文件写入，供「使用模板」脚手架消费"
---

# @deepseek-ai/dsh-sdkwork-template-install

[English](README.md) | 中文

## 概述

`sdkworkTemplateInstall` Remote 命名空间背后的宿主能力：向操作者选定的目录写入一个常规文件，并按需创建父目录。每次写入都会复查解析后的路径仍位于目标目录之内，拒绝穿越（`..`）、绝对路径、携带 NUL 的名字、Windows 保留设备段以及以点或空格结尾的段；单文件字节上限 64 MiB。浏览器侧负责规划模板安装（下载、解压、筛查见 `ui-sdkwork-deploy` 的 `templateInstall.ts`）并驱动这些写入；本包不持有任何线上词表。

## 已知限制与后续工作

- 落点约束把解析路径按词法包含在目标的真实路径之下；不追踪目标目录内已存在的符号链接（目录既有内容归操作者所有）。
- 每次调用写一个文件：大模板意味着每文件一次往返。若模板普遍携带数千文件，后续可加分块归档动词（begin/push/finish）。
