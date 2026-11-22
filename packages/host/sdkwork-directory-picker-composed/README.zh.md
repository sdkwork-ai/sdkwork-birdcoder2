---
description: "SDKWork 目录选择缝的组合后端：一个 ctx.directoryPicker 同时提供原生 OS 选择器与浏览原语，使桌面启动保留 OS 工作区对话框，同时应用内文件浏览仍可用。"
kind: "package-reference"
---

# @deepseek-ai/dsh-sdkwork-directory-picker-composed

[English](README.md) | 中文

## 概述

[目录选择缝](../directory-picker/README.zh.md)的 SDKWork 组合交互：一个同时提供两种形态的 `ctx.directoryPicker` 能力。`pick` 委派给[原生](../directory-picker-native/README.zh.md) OS 选择器，因此有人值守的桌面启动保留 OS 工作区对话框；`list`、`createDirectory`、`readTextFile` 与 `writeTextFile` 委派给[浏览](../directory-picker-browse/README.zh.md)后端的受治文件系统实现。在同一主机解析出 `native` 却仍需从同一个服务提供应用内目录浏览与受治文本读写的场景里，应组合本后端而不是单一形态后端。

## 目录

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

<a id="use-this-package"></a>
## 使用本包

当同一主机必须为工作区对话框保留 OS 选择器、同时仍需回应浏览线上动词时，组合本后端。`ComposedDirectoryPicker` 继承浏览后端并覆盖 `capability()`，因此服务保留浏览实现的配置、路由与生命周期，而能力对外给出合并后的形态。

[SDKWork 自适应选择器](../sdkwork-directory-picker-auto/README.zh.md)把本后端作为其 `native` 分支挂载；要钉死该形态，直接组合这一行即可。

<a id="understand-the-implementation"></a>
## 理解实现

该能力在服务生命周期内是一个稳定对象：`pick` 转发到原生后端所用的同一套选择器机件，每个浏览成员转发到继承来的浏览实现，受治围栏仍由后者作为唯一策略点。

| 成员 | 委派目标 |
|---|---|
| `pick(signal)` | `pickNativeDirectory(signal)` |
| `list(path, signal)` | 继承的浏览 `list` |
| `createDirectory(path, name)` | 继承的浏览 `createDirectory` |
| `readTextFile(path, signal)` | 继承的浏览 `readTextFile` |
| `writeTextFile(path, content)` | 继承的浏览 `writeTextFile` |

`src/capability.ts` 声明 `DirectoryPickerComposedCapability`（合并后的成员集合），并把 `composed` 通过声明合并加入缝的 `DirectoryPickerCapabilities` 映射，因此线上消费方与基础形态一样，经同一个带类型的能力访问器读取它。1 MiB 文本上限、完全限定路径围栏与可中止操作都来自浏览实现，而不在此处重述。

## 开发备注

暂无额外运维备注；契约以上方章节为准。

## Model Experience

无，因为该后端只解析调用方选定的目录与文件字节；它不注册任何工具、prompt 段或 Session 事件。

#### KV Cache effect

无；本包既不组装也不发送提供方请求。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与延期工作

- **平台行为委派给原生宿主**——`pick` 运行原生后端所用的 OS 选择器机件，因此其可用性与平台差异（macOS 激活、Linux 的 Zenity/KDialog、Windows 子进程）跟随该后端，本包不做适配；没有选择器的主机屏幕上什么也不会渲染。
- **线上消费方必须接纳合并形态**——能力闸门只接受 `native` 或 `browse` 的消费方会拒绝 `composed`；它只能经缝的声明合并能力映射被看到（当前采用者是 workspace controller 的闸门）。
- **两种形态同时提供，任一面都无法撤下**——组合能力始终宣告浏览成员；若部署要禁止应用内文件系统访问，应改为组合纯原生后端。
