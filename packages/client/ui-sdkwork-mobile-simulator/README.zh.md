---
description: "Browser-based mobile device simulator: renders web content inside authentic device frames with inline and modal display modes, screen rotation, device switching, and user-agent emulation."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-mobile-simulator

[English](README.md) | 中文

## 概述


基于浏览器的移动端模拟器插件：在真实的设备边框内渲染网页内容（iPhone、三星 Galaxy、华为 Mate/P、小米、OPPO、Google Pixel、OnePlus），支持 inline 和弹窗两种显示模式，具备屏幕旋转、设备切换和用户代理模拟功能，兼容 Web 和 Electron 两种运行环境。

该模拟器是纯展示插件——不提供主机端行为，不发送 Cordis 事件，也不拥有任何跨插件的可变状态。它将目标 URL 加载在按比例缩放的 iframe 内，保持设备的原生宽高比，物理边框完全使用 HTML 和 CSS 绘制（ notch/cutout 形状使用内联 SVG，无需图片资源）。

## 目录

- [功能特性](#features)
- [插槽注册](#slot-registrations)
- [设备目录](#device-catalog)
- [模型体验](#model-experience)
- [已知限制和后续工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

## 功能特性

- **真实设备边框** — 8 个品牌 17+ 款设备，每款都具有精确的屏幕尺寸、像素比、边框半径和安全区域插入值。
- **刘海/挖孔模拟** — 灵动岛（iPhone 15+）、传统刘海（iPhone 14、华为 Mate）、挖孔（三星、小米、OPPO）和水滴屏样式，均使用内联 SVG/CSS 渲染。
- **屏幕旋转** — 在横屏和竖屏之间切换；边框、安全区域插入值和状态栏会自适应方向。
- **设备切换** — 下拉选择器包含所有目录设备；切换时保留已加载的 URL 并更新边框尺寸。
- **User-Agent 模拟** — 每款设备都附带真实的 User-Agent 字符串（iOS/Android 使用 WebKit，回退使用 Blink），通过 iframe 的 `data-user-agent` 属性暴露给下游工具。
- **内联和弹窗模式** — 直接在布局中嵌入模拟器（`mode="inline"`），或者使其浮在模糊背景上（`mode="modal"`），支持按 Esc 键关闭和点击背景关闭。
- **Web + Electron 兼容** — 在浏览器环境和 Electron 桌面壳中表现一致；不需要预加载桥接（模拟器渲染的是标准 iframe，而非原生窗口表面）。
- **响应式缩放** — 边框通过 `ResizeObserver` 自适应容器大小，在小视口下保持宽高比。

## 插槽注册

插件在 `shell.overlay` 下贡献两个插槽：

| 插槽 | ID | 模式 | 用途 |
|------|----|------|------|
| `mobile-simulator.inline` | `mobile-simulator-inline` | inline | 在主机布局中嵌入模拟器 |
| `mobile-simulator.modal` | `mobile-simulator-modal` | modal | 使模拟器浮在背景上 |

两个插槽接受相同的注入接口（`SimulatorSlotInjected`）：

```typescript
interface SimulatorSlotInjected {
  url: string              // URL to load inside the simulator
  initialDeviceId?: string // device slug (e.g. "iphone-15-pro")
  initialOrientation?: 'portrait' | 'landscape'
  mode: 'inline' | 'modal'
  onDeviceChange?: (device: DeviceSpec) => void
  onClose?: () => void     // modal-only: close callback
}
```

## 设备目录

目录涵盖 8 个品牌 17+ 款设备。每款都包含渲染真实边框所需的物理尺寸和用户代理模拟所需的浏览器标识：

- **Apple** — iPhone 15 Pro Max、iPhone 15 Pro、iPhone 15、iPhone 14、iPhone SE（第三代）、iPhone 13 mini
- **三星** — Galaxy S24 Ultra、Galaxy S24、Galaxy Z Fold5、Galaxy A54
- **华为** — Mate 60 Pro、P60 Pro、Mate X5
- **小米** — Xiaomi 14 Pro、Xiaomi 13
- **OPPO** — Find X7、Reno11
- **Google** — Pixel 8 Pro、Pixel 8
- **OnePlus** — OnePlus 12

设备参数（屏幕尺寸、像素比、刘海样式、安全区域插入值、边框半径、边框颜色）参考 Apple 开发者文档和 OEM 规格表。

## 模型体验

无，该包为纯展示工具。模拟器在 iframe 中渲染网页内容，但不提交消息、不添加会话事件、也不更改模型请求。

#### KV 缓存影响

无；该包不组装或发送任何提供商请求。

## 已知限制和后续工作

- **无触控模拟** — 模拟器渲染可视边框，但不合成触控事件或指针类型模拟。iframe 接收来自宿主浏览器的标准鼠标/指针输入。
- **无网络节流** — 模拟器不模拟蜂窝网络条件（延迟、带宽）。iframe 以宿主原生网络速度加载。
- **无设备传感器模拟** — iframe 内的加速度计、陀螺仪和 GPS API 返回宿主值（或不可用），而非模拟的设备传感器。
- **单 URL 导航** — 模拟器一次加载一个 URL；框架内没有标签页管理或历史堆栈。
- **无截图导出** — 模拟器不将边框捕获为图像。后续迭代可能通过 `html2canvas` 或 Electron 原生捕获 API 添加 PNG 导出。

### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

模拟器是纯展示插件：没有主机端行为、不发送 Cordis 事件、不拥有跨插件可变状态——新增功能必须保持这条边界。`shell.overlay` 两个插槽接受同一个 `SimulatorSlotInjected` 接口，inline 与 modal 消费方因此可互换；扩展设备目录时，设备参数应继续遵循 Apple 开发者文档与 OEM 规格表。

</details>
