/**
 * Device catalog: canonical mobile devices with their screen specifications,
 * pixel densities, and user-agent strings for emulation. Each device entry
 * captures the physical metrics needed to render an authentic frame and the
 * browser identity needed for user-agent override.
 */

/** Screen notch/cutout style rendered at the top of the device frame. */
export type NotchStyle = 'none' | 'notch' | 'dynamic-island' | 'punch-hole' | 'waterdrop'

/** Physical device frame material/color option. */
export type FrameColor = 'black' | 'white' | 'silver' | 'gold' | 'blue' | 'green' | 'purple' | 'red'

/** Browser engine family used for user-agent generation. */
export type BrowserEngine = 'webkit' | 'blink'

/** A cataloged mobile device with its screen and identity specification. */
export interface DeviceSpec {
  /** Stable device identifier (slug). */
  readonly id: string
  /** Human-readable device name. */
  readonly name: string
  /**Device manufacturer/brand. */
  readonly brand: 'Apple' | 'Samsung' | 'Huawei' | 'Xiaomi' | 'OPPO' | 'vivo' | 'Google' | 'OnePlus' | 'Sony' | 'Nokia'
  /** Device product line. */
  readonly line: 'iPhone' | 'Galaxy S' | 'Galaxy A' | 'Galaxy Z' | 'P系列' | 'Mate系列' | 'Mi系列' | 'Pixel' | 'Find X' | 'X系列' | 'Reno' | 'Xperia' | 'Android'
  /** Logical screen width in CSS pixels (portrait). */
  readonly width: number
  /** Logical screen height in CSS pixels (portrait). */
  readonly height: number
  /** Device pixel ratio (physical / logical). */
  readonly pixelRatio: number
  /** Screen notch/cutout style. */
  readonly notch: NotchStyle
  /** Available frame colors. */
  readonly colors: readonly FrameColor[]
  /** Default frame color. */
  readonly defaultColor: FrameColor
  /** Touch-screen safe-area insets (px): [top, right, bottom, left]. */
  readonly safeArea: readonly [number, number, number, number]
  /** Physical outline radius (px). */
  readonly radius: number
  /** Whether the device has a physical.home button. */
  readonly hasHomeButton: boolean
  /** Device release year (for catalog grouping). */
  readonly year: number
  /** Engine family used for the user-agent string. */
  readonly engine: BrowserEngine
  /** Human-readable screen size in inches (optional). */
  readonly screenSize?: string
}

/** Group label for the device catalog sidebar. */
export type DeviceGroup = 'Apple' | 'Samsung' | 'Huawei' | 'Xiaomi' | 'OPPO' | 'vivo' | 'Google' | 'OnePlus' | 'Other'

/** A labeled group in the device catalog. */
export interface DeviceGroupDef {
  /** Group identifier. */
  readonly id: DeviceGroup
  /** Display label for the group header. */
  readonly label: string
  /** Devices in this group, display order. */
  readonly devices: readonly DeviceSpec[]
}

/**
 * Canonical device catalog, grouped by brand. Screen metrics follow Apple's
 * developer documentation and the OEM spec sheets; logical sizes are CSS pixels
 * at the device's native orientation (portrait). Pixel ratios map to the
 * standard DPR tiers each device ships with.
 */
export const DEVICE_CATALOG: readonly DeviceGroupDef[] = [
  {
    id: 'Apple',
    label: 'Apple iPhone',
    devices: [
      {
        id: 'iphone-15-pro-max',
        name: 'iPhone 15 Pro Max',
        brand: 'Apple',
        line: 'iPhone',
        width: 430,
        height: 932,
        pixelRatio: 3,
        notch: 'dynamic-island',
        colors: ['black', 'white', 'blue', 'gold'] as FrameColor[],
        defaultColor: 'black',
        safeArea: [59, 0, 34, 0],
        radius: 55,
        hasHomeButton: false,
        year: 2023,
        engine: 'webkit',
        screenSize: '6.7"',
      },
      {
        id: 'iphone-15-pro',
        name: 'iPhone 15 Pro',
        brand: 'Apple',
        line: 'iPhone',
        width: 393,
        height: 852,
        pixelRatio: 3,
        notch: 'dynamic-island',
        colors: ['black', 'white', 'blue'] as FrameColor[],
        defaultColor: 'black',
        safeArea: [59, 0, 34, 0],
        radius: 50,
        hasHomeButton: false,
        year: 2023,
        engine: 'webkit',
        screenSize: '6.1"',
      },
      {
        id: 'iphone-15',
        name: 'iPhone 15',
        brand: 'Apple',
        line: 'iPhone',
        width: 393,
        height: 852,
        pixelRatio: 3,
        notch: 'dynamic-island',
        colors: ['black', 'white', 'blue', 'green', 'yellow'] as FrameColor[],
        defaultColor: 'black',
        safeArea: [59, 0, 34, 0],
        radius: 50,
        hasHomeButton: false,
        year: 2023,
        engine: 'webkit',
        screenSize: '6.1"',
      },
      {
        id: 'iphone-14',
        name: 'iPhone 14',
        brand: 'Apple',
        line: 'iPhone',
        width: 390,
        height: 844,
        pixelRatio: 3,
        notch: 'notch',
        colors: ['black', 'white', 'blue', 'purple', 'red'] as FrameColor[],
        defaultColor: 'black',
        safeArea: [47, 0, 34, 0],
        radius: 48,
        hasHomeButton: false,
        year: 2022,
        engine: 'webkit',
        screenSize: '6.1"',
      },
      {
        id: 'iphone-se-3',
        name: 'iPhone SE (3rd gen)',
        brand: 'Apple',
        line: 'iPhone',
        width: 375,
        height: 667,
        pixelRatio: 2,
        notch: 'none',
        colors: ['black', 'white', 'red'] as FrameColor[],
        defaultColor: 'black',
        safeArea: [20, 0, 0, 0],
        radius: 40,
        hasHomeButton: true,
        year: 2022,
        engine: 'webkit',
        screenSize: '4.7"',
      },
      {
        id: 'iphone-13-mini',
        name: 'iPhone 13 mini',
        brand: 'Apple',
        line: 'iPhone',
        width: 375,
        height: 812,
        pixelRatio: 3,
        notch: 'notch',
        colors: ['black', 'white', 'blue', 'green', 'pink'] as FrameColor[],
        defaultColor: 'black',
        safeArea: [47, 0, 34, 0],
        radius: 45,
        hasHomeButton: false,
        year: 2021,
        engine: 'webkit',
        screenSize: '5.4"',
      },
    ],
  },
  {
    id: 'Samsung',
    label: 'Samsung Galaxy',
    devices: [
      {
        id: 'galaxy-s24-ultra',
        name: 'Galaxy S24 Ultra',
        brand: 'Samsung',
        line: 'Galaxy S',
        width: 384,
        height: 824,
        pixelRatio: 3,
        notch: 'punch-hole',
        colors: ['black', 'silver'] as FrameColor[],
        defaultColor: 'black',
        safeArea: [32, 0, 20, 0],
        radius: 35,
        hasHomeButton: false,
        year: 2024,
        engine: 'webkit',
        screenSize: '6.8"',
      },
      {
        id: 'galaxy-s24',
        name: 'Galaxy S24',
        brand: 'Samsung',
        line: 'Galaxy S',
        width: 360,
        height: 780,
        pixelRatio: 3,
        notch: 'punch-hole',
        colors: ['black', 'silver', 'green', 'blue'] as FrameColor[],
        defaultColor: 'black',
        safeArea: [32, 0, 20, 0],
        radius: 30,
        hasHomeButton: false,
        year: 2024,
        engine: 'webkit',
        screenSize: '6.2"',
      },
      {
        id: 'galaxy-z-fold5',
        name: 'Galaxy Z Fold5',
        brand: 'Samsung',
        line: 'Galaxy Z',
        width: 384,
        height: 824,
        pixelRatio: 3,
        notch: 'punch-hole',
        colors: ['black', 'silver', 'blue'] as FrameColor[],
        defaultColor: 'black',
        safeArea: [32, 0, 20, 0],
        radius: 25,
        hasHomeButton: false,
        year: 2023,
        engine: 'webkit',
        screenSize: '7.6" (unfolded)',
      },
      {
        id: 'galaxy-a54',
        name: 'Galaxy A54',
        brand: 'Samsung',
        line: 'Galaxy A',
        width: 360,
        height: 800,
        pixelRatio: 3,
        notch: 'punch-hole',
        colors: ['black', 'silver', 'green'] as FrameColor[],
        defaultColor: 'black',
        safeArea: [32, 0, 20, 0],
        radius: 25,
        hasHomeButton: false,
        year: 2023,
        engine: 'webkit',
        screenSize: '6.4"',
      },
    ],
  },
  {
    id: 'Huawei',
    label: '华为',
    devices: [
      {
        id: 'huawei-mate-60-pro',
        name: 'Mate 60 Pro',
        brand: 'Huawei',
        line: 'Mate系列',
        width: 393,
        height: 852,
        pixelRatio: 3,
        notch: 'notch',
        colors: ['black', 'silver', 'green'] as FrameColor[],
        defaultColor: 'black',
        safeArea: [48, 0, 24, 0],
        radius: 40,
        hasHomeButton: false,
        year: 2023,
        engine: 'webkit',
        screenSize: '6.82"',
      },
      {
        id: 'huawei-p60-pro',
        name: 'P60 Pro',
        brand: 'Huawei',
        line: 'P系列',
        width: 393,
        height: 852,
        pixelRatio: 3,
        notch: 'punch-hole',
        colors: ['black', 'white', 'blue'] as FrameColor[],
        defaultColor: 'black',
        safeArea: [40, 0, 24, 0],
        radius: 40,
        hasHomeButton: false,
        year: 2023,
        engine: 'webkit',
        screenSize: '6.67"',
      },
      {
        id: 'huawei-mate-x5',
        name: 'Mate X5',
        brand: 'Huawei',
        line: 'Mate系列',
        width: 384,
        height: 824,
        pixelRatio: 3,
        notch: 'notch',
        colors: ['black', 'silver'] as FrameColor[],
        defaultColor: 'black',
        safeArea: [40, 0, 24, 0],
        radius: 25,
        hasHomeButton: false,
        year: 2023,
        engine: 'webkit',
        screenSize: '7.85" (unfolded)',
      },
    ],
  },
  {
    id: 'Xiaomi',
    label: '小米',
    devices: [
      {
        id: 'xiaomi-14-pro',
        name: 'Xiaomi 14 Pro',
        brand: 'Xiaomi',
        line: 'Mi系列',
        width: 393,
        height: 852,
        pixelRatio: 3,
        notch: 'punch-hole',
        colors: ['black', 'white', 'green'] as FrameColor[],
        defaultColor: 'black',
        safeArea: [40, 0, 24, 0],
        radius: 35,
        hasHomeButton: false,
        year: 2024,
        engine: 'webkit',
        screenSize: '6.73"',
      },
      {
        id: 'xiaomi-13',
        name: 'Xiaomi 13',
        brand: 'Xiaomi',
        line: 'Mi系列',
        width: 393,
        height: 852,
        pixelRatio: 3,
        notch: 'punch-hole',
        colors: ['black', 'white', 'green', 'blue'] as FrameColor[],
        defaultColor: 'black',
        safeArea: [40, 0, 24, 0],
        radius: 35,
        hasHomeButton: false,
        year: 2023,
        engine: 'webkit',
        screenSize: '6.36"',
      },
    ],
  },
  {
    id: 'OPPO',
    label: 'OPPO',
    devices: [
      {
        id: 'oppo-find-x7',
        name: 'Find X7',
        brand: 'OPPO',
        line: 'Find X',
        width: 393,
        height: 852,
        pixelRatio: 3,
        notch: 'punch-hole',
        colors: ['black', 'blue', 'gold'] as FrameColor[],
        defaultColor: 'black',
        safeArea: [40, 0, 24, 0],
        radius: 35,
        hasHomeButton: false,
        year: 2024,
        engine: 'webkit',
        screenSize: '6.78"',
      },
      {
        id: 'oppo-reno11',
        name: 'Reno11',
        brand: 'OPPO',
        line: 'Reno',
        width: 393,
        height: 852,
        pixelRatio: 3,
        notch: 'punch-hole',
        colors: ['black', 'blue', 'green'] as FrameColor[],
        defaultColor: 'black',
        safeArea: [40, 0, 24, 0],
        radius: 30,
        hasHomeButton: false,
        year: 2024,
        engine: 'webkit',
        screenSize: '6.7"',
      },
    ],
  },
  {
    id: 'Google',
    label: 'Google Pixel',
    devices: [
      {
        id: 'pixel-8-pro',
        name: 'Pixel 8 Pro',
        brand: 'Google',
        line: 'Pixel',
        width: 448,
        height: 992,
        pixelRatio: 3,
        notch: 'punch-hole',
        colors: ['black', 'white', 'blue'] as FrameColor[],
        defaultColor: 'black',
        safeArea: [36, 0, 24, 0],
        radius: 40,
        hasHomeButton: false,
        year: 2023,
        engine: 'webkit',
        screenSize: '6.7"',
      },
      {
        id: 'pixel-8',
        name: 'Pixel 8',
        brand: 'Google',
        line: 'Pixel',
        width: 412,
        height: 915,
        pixelRatio: 3,
        notch: 'punch-hole',
        colors: ['black', 'white', 'green'] as FrameColor[],
        defaultColor: 'black',
        safeArea: [36, 0, 24, 0],
        radius: 35,
        hasHomeButton: false,
        year: 2023,
        engine: 'webkit',
        screenSize: '6.2"',
      },
    ],
  },
  {
    id: 'OnePlus',
    label: 'OnePlus',
    devices: [
      {
        id: 'oneplus-12',
        name: 'OnePlus 12',
        brand: 'OnePlus',
        line: 'X系列',
        width: 412,
        height: 915,
        pixelRatio: 3,
        notch: 'punch-hole',
        colors: ['black', 'green'] as FrameColor[],
        defaultColor: 'black',
        safeArea: [40, 0, 24, 0],
        radius: 35,
        hasHomeButton: false,
        year: 2024,
        engine: 'webkit',
        screenSize: '6.82"',
      },
    ],
  },
] as const

/** Flattened view of every device in display order. */
export const ALL_DEVICES: readonly DeviceSpec[] = DEVICE_CATALOG.flatMap(group => [...group.devices])

/** Look up a device by its stable id; undefined when no device matches. */
export function findDevice(id: string): DeviceSpec | undefined {
  return ALL_DEVICES.find(device => device.id === id)
}

/**
 * Generate a representative user-agent string for a device. The string follows
 * each engine family's canonical format and the OS version the device ships
 * with; it is suitable for the `navigator.userAgent` override inside the
 * simulator iframe. iOS builds mirror Mobile/15E148-style version tokens;
 * Android builds mirror Chrome-on-Android with the appropriate device tag.
 * @param device - the device to emulate.
 * @returns a user-agent string faithful to the device's identity and engine.
 */
export function deviceUserAgent(device: DeviceSpec): string {
  const { brand, line, engine, width, height, pixelRatio } = device
  if (engine === 'webkit') {
    if (brand === 'Apple') {
      const iosVersion = device.year >= 2023 ? '17_0' : device.year >= 2022 ? '16_0' : '15_6'
      return `Mozilla/5.0 (iPhone; CPU iPhone OS ${iosVersion} like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${iosVersion.slice(0, 2)}.0 Mobile/15E148 Safari/604.1`
    }
    const androidVersion = device.year >= 2024 ? '14' : device.year >= 2023 ? '13' : '12'
    const buildTag = `${brand} ${line}`.replace(/\s+/g, '')
    return `Mozilla/5.0 (Linux; Android ${androidVersion}; ${buildTag}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36`
  }
  // Blink fallback (Android Chromium-style UA)
  const androidVersion = device.year >= 2024 ? '14' : '13'
  const dpr = pixelRatio.toFixed(1)
  return `Mozilla/5.0 (Linux; Android ${androidVersion}; ${brand} ${line}; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36`
}

/** CSS color value for a frame color token. */
export function frameColorValue(color: FrameColor): string {
  switch (color) {
    case 'black': return '#1a1a1a'
    case 'white': return '#f5f5f0'
    case 'silver': return '#c8c8cc'
    case 'gold': return '#e8d5b7'
    case 'blue': return '#4a6fa5'
    case 'green': return '#6b8e6b'
    case 'purple': return '#8b6b9b'
    case 'red': return '#c44545'
  }
}
