# Tablet adaptation notes

This root follows `APP_PAD_ARCHITECTURE_SPEC.md` §5. The machine contract is
`specs/tablet-adaptation.spec.json`; this note records how the scaffold implements it.

## Window classes

| Class | Width (logical px/pt) | Navigation | Composition |
| --- | --- | --- | --- |
| `compact` | 320-599 | drawer | single column |
| `medium` | 600-839 | rail | rail plus content |
| `expanded` | 840-1199 | sidebar | master-detail |
| `large` | 1200+ | sidebar | three-pane with inspector |

Detection uses `ResizeObserver` on the document element and actual viewport width. No
device model, user-agent string, or fixed orientation is used for layout.

## State preservation

The root shell keeps route, selection, pane ratio, and scroll state outside the window-class
switch. A resize only changes composition; it never reloads data or remounts capability
routes.

## Multitasking

- iPadOS: Split View, Slide Over, and Stage Manager are declared. The compact class is a
  first-class Slide Over / split-edge state.
- Android: freeform multi-window is declared and the native manifest must keep
  `resizeableActivity` enabled.
- One authenticated session backs every window. Per-window navigation stacks are explicit.

## Safe areas and input

CSS consumes `env(safe-area-inset-*)` on all four edges. Touch targets are 44 pt on iPadOS
and 48 dp on Android tablets. Pointer, trackpad, and hardware keyboard input are supported;
every hover or right-click affordance has a touch and focus equivalent. Stylus is not claimed
by this root.

## Evidence

The declared matrix has one row for every target, window class, orientation, and claimed
multitasking mode. Required screenshots and per-row layout expectations live in
`assets/capture/tablet/`. Automated coverage lives in `tests/tablet/`.