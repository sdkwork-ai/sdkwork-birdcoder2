# Tablet adaptation evidence

This directory is the `evidence.screenshots` path of
`specs/tablet-adaptation.spec.json`.

## Required captures

Each row below must have a captured screenshot before a release is marked ready. Use the
`<runtime-target>-<window-class>-<orientation>-<multitasking>.png` naming.

| Runtime target | Window class | Orientation | Multitasking | Expected layout |
| --- | --- | --- | --- | --- |
| tablet-ipados | compact | portrait | slide-over | single column, drawer navigation |
| tablet-ipados | compact | landscape | split-view | single column, drawer navigation |
| tablet-ipados | medium | portrait | full-screen | navigation rail and content |
| tablet-ipados | medium | landscape | stage-manager | navigation rail and content |
| tablet-ipados | expanded | portrait | split-view | master-detail |
| tablet-ipados | expanded | landscape | full-screen | master-detail |
| tablet-ipados | large | portrait | stage-manager | three-pane |
| tablet-ipados | large | landscape | full-screen | three-pane |
| tablet-android | compact | portrait | full-screen | single column, drawer navigation |
| tablet-android | compact | landscape | freeform | single column, drawer navigation |
| tablet-android | medium | portrait | full-screen | navigation rail and content |
| tablet-android | medium | landscape | freeform | navigation rail and content |
| tablet-android | expanded | portrait | full-screen | master-detail |
| tablet-android | expanded | landscape | freeform | master-detail |
| tablet-android | large | portrait | full-screen | three-pane |
| tablet-android | large | landscape | freeform | three-pane |

## What each capture must prove

- All four safe-area insets are respected (status bar, home indicator, rounded corners,
  camera cutout, multitasking controls).
- No interactive control sits inside a system gesture zone.
- Touch targets meet 44 pt (iPadOS) / 48 dp (Android).
- Text is not clipped at the platform's largest text scale.
- The layout reflows on resize without losing route, selection, or scroll state.

Store captures at tablet-native resolution. A scaled phone screenshot is not evidence.