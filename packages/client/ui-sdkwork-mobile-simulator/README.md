---
description: "Browser-based mobile device simulator: renders web content inside authentic device frames with inline and modal display modes, screen rotation, device switching, and user-agent emulation."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-mobile-simulator

English | [中文](README.zh.md)

## Summary


Browser-based mobile device simulator: renders web content inside an authentic device frame (iPhone, Samsung Galaxy, Huawei Mate/P, Xiaomi, OPPO, Google Pixel, OnePlus) with inline and modal display modes, supporting screen rotation, device switching, and user-agent emulation for both web and Electron compositions.

The simulator is a pure presentation plugin — it contributes no host-side behavior, emits no Cordis events, and owns no cross-plugin mutable state. It mounts a target URL inside a scaled iframe that preserves the device's native aspect ratio, with the physical frame drawn entirely in HTML and CSS (inline SVG for notch/cutout shapes, no image assets).

## Table of Contents

- [Features](#features)
- [Slot Registrations](#slot-registrations)
- [Device Catalog](#device-catalog)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

## Features

- **Authentic device frames** — 17+ devices across 8 brands, each with accurate screen dimensions, pixel ratios, bezel radii, and safe-area insets.
- **Notch/cutout emulation** — Dynamic Island (iPhone 15+), traditional notch (iPhone 14, Huawei Mate), punch-hole (Samsung, Xiaomi, OPPO), and waterdrop styles rendered as inline SVG/CSS.
- **Screen rotation** — Toggle between portrait and landscape; the frame, safe-area insets, and status bar adapt to the orientation.
- **Device switching** — Dropdown selector with all cataloged devices; switching preserves the loaded URL and updates the frame metrics.
- **User-agent emulation** — Each device ships with a faithful user-agent string (WebKit for iOS/Android, Blink fallback) exposed via the iframe's `data-user-agent` attribute for downstream tooling.
- **Inline and modal modes** — Embed the simulator directly in a layout (`mode="inline"`) or float it over a blurred backdrop (`mode="modal"`) with close-on-Esc and close-on-backdrop-click.
- **Web + Electron compatible** — Runs identically in the browser harness and the Electron desktop shell; no preload bridge required (the simulator renders a standard iframe, not a native window surface).
- **Responsive scaling** — The frame auto-fits its container via `ResizeObserver`, preserving aspect ratio down to small viewports.

## Slot Registrations

The plugin contributes two slots under `shell.overlay`:

| Slot | Id | Mode | Purpose |
|------|----|------|---------|
| `mobile-simulator.inline` | `mobile-simulator-inline` | inline | Embeds the simulator in the host layout |
| `mobile-simulator.modal` | `mobile-simulator-modal` | modal | Floats the simulator over a backdrop |

Both slots accept the same inject face (`SimulatorSlotInjected`):

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

## Device Catalog

The catalog covers 17+ devices across 8 brands. Each entry captures the physical metrics needed to render an authentic frame and the browser identity needed for user-agent override:

- **Apple** — iPhone 15 Pro Max, iPhone 15 Pro, iPhone 15, iPhone 14, iPhone SE (3rd gen), iPhone 13 mini
- **Samsung** — Galaxy S24 Ultra, Galaxy S24, Galaxy Z Fold5, Galaxy A54
- **Huawei** — Mate 60 Pro, P60 Pro, Mate X5
- **Xiaomi** — Xiaomi 14 Pro, Xiaomi 13
- **OPPO** — Find X7, Reno11
- **Google** — Pixel 8 Pro, Pixel 8
- **OnePlus** — OnePlus 12

Device metrics (screen dimensions, pixel ratio, notch style, safe-area insets, bezel radius, frame colors) follow Apple's developer documentation and the OEM spec sheets.

## Model Experience

None, as the package is a pure presentation tool. The simulator renders web content in an iframe but does not submit messages, add session events, or change model requests.

#### KV Cache effect

None; the package never assembles or sends provider requests.

## Known Limitations and Deferred Work

- **No touch emulation** — The simulator renders the visual frame but does not synthesize touch events or pointer-type emulation. The iframe receives standard mouse/pointer input from the host browser.
- **No network throttling** — The simulator does not emulate cellular network conditions (latency, bandwidth). The iframe loads at the host's native network speed.
- **No device sensor emulation** — Accelerometer, gyroscope, and GPS APIs inside the iframe return the host's values (or are unavailable), not simulated device sensors.
- **Single URL navigation** — The simulator loads one URL at a time; there is no tab management or history stack inside the frame.
- **No screenshot export** — The simulator does not capture the frame as an image. A future iteration may add PNG export via `html2canvas` or the Electron native capture API.

### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The simulator is a pure presentation plugin: no host-side behavior, no Cordis events, no cross-plugin mutable state — keep new features on that side of the line. Both `shell.overlay` slots accept the same `SimulatorSlotInjected` face, so inline and modal consumers stay interchangeable, and the device catalog's metrics follow Apple's documentation and the OEM spec sheets when extended.

</details>
