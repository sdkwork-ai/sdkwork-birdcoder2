/**
 * Client plugin body for the mobile simulator. Registers the simulator
 * surface into the slot system so host applications can mount it inline
 * (embedded in a layout) or in a modal overlay. The plugin is browser-only:
 * it relies on DOM APIs (iframe, ResizeObserver) and CSS viewport units, and
 * composes cleanly over both the web harness and the Electron desktop shell
 * (the Electron preload bridge is not required — the simulator renders a
 * standard iframe, not a native window surface).
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import { MobileSimulator, type MobileSimulatorProps } from './MobileSimulator.tsx'
import { Modal, type ModalProps } from './Modal.tsx'
import type { DeviceSpec } from './devices.ts'

export type { MobileSimulatorProps, ModalProps } from './MobileSimulator.tsx'
export type { DeviceSpec } from './devices.ts'

/** Injected face for the simulator slot: the URL and initial device to show. */
export interface SimulatorSlotInjected extends Pick<MobileSimulatorProps, 'url' | 'initialDeviceId' | 'initialOrientation' | 'mode'> {
  /** Invoked when the active device changes. */
  onDeviceChange?: (device: DeviceSpec) => void
  /** Invoked when the modal requests to close. */
  onClose?: () => void
}

/** Full props for the inline simulator slot occupant. */
export type InlineSimulatorProps =
  import('@deepseek-ai/dsh-client-ui-slots').PropsRuntime<'shell.overlay'>
  & InjectFace<SimulatorSlotInjected>

/** Full props for the modal simulator slot occupant. */
export type ModalSimulatorProps =
  import('@deepseek-ai/dsh-client-ui-slots').PropsRuntime<'shell.overlay'>
  & InjectFace<SimulatorSlotInjected>

/** Required services: the slot registry for component contribution. */
export const inject = ['slots']

/**
 * Construct the inject face for the simulator slot, pulling URL, device, and
 * mode preferences from the injected props.
 * @param injected - the slot's injected face.
 * @returns a face consumed by MobileSimulator.
 */
function simulatorInject(injected: SimulatorSlotInjected): MobileSimulatorProps {
  return {
    url: injected.url,
    initialDeviceId: injected.initialDeviceId,
    initialOrientation: injected.initialOrientation,
    mode: injected.mode,
    showToolbar: true,
    onDeviceChange: injected.onDeviceChange,
    onClose: injected.onClose,
  }
}

/**
 * Register the simulator into the slot system. Two slots are contributed:
 *
 * - `mobile-simulator.inline` — an inline surface the host embeds in its layout.
 *   The simulator fills its container and renders the device frame at a scale
 *   that preserves the native aspect ratio.
 *
 * - `mobile-simulator.modal` — a modal overlay that floats above the host with
 *   a blurred backdrop, closing on backdrop click or Esc.
 *
 * Both slots carry the same inject face (`SimulatorSlotInjected`), so a host
 * declarative configures URL, device, and orientation once and the same
 * registration serves both display modes through the slot id.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  // Inline simulator: embeds directly in the host layout.
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    key: 'mobile-simulator-inline',
    order: 50,
    inject: (injected) => simulatorInject(injected as SimulatorSlotInjected),
  }, MobileSimulator))

  // Modal simulator: floats over a centered backdrop with close-on-Esc.
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    key: 'mobile-simulator-modal',
    order: 60,
    inject: (injected) => ({
      ...simulatorInject(injected as SimulatorSlotInjected),
      mode: 'modal' as const,
    }),
  }, MobileSimulator))
}
