# @deepseek-ai/dsh-client-ui-app-modes

English | [中文](README.zh.md)

App-mode surface plugin: the WeChat-desktop-style mode rail shell, the base five mode entries and their placeholder pages, and the sidebar-visibility preference row. The frame's fixed leftmost track (`mode.rail`, declared by ui-layout) hosts the rail shell; the active mode lives in the layout store, so the frame hands it to the rail as owner props and the rail holds no state of its own. The shell renders one keyed `mode.rail.entry` seat per mode id in launcher order (Code / Work / Video / Image / App Store / Knowledge / Assets) and passes each entry the live selection facts; every mode module contributes its own entry — the base five here, Knowledge Base and Assets from the independent `ui-knowledge` and `ui-assets` packages. Clicking a non-code entry switches the frame's mode: the center column then renders the keyed `mode.page` slot (entryKey = the mode id) instead of the conversation, and switching back to Code restores the conversation surface. The rail stays mounted in both sidebar states, so mode switching never depends on the sidebar being expanded. The rail's bottom also holds the settings trigger: the `mode.rail.settings` seat (declared by this package, occupied by ui-settings-general's trigger + modal panel) renders outside the entries group, so the settings button is not announced as an app mode, and it stays reachable while the sidebar is collapsed.

The four non-code modes are placeholder pages — a hero glyph, the mode name, and a construction notice with a hint back to the Code workbench. Code is the workbench itself and has no page entry.

The plugin also owns the sidebar-visibility preference: a General settings row (`settings.general.item`, id `app-modes-sidebar`) over the `ui-app-modes` settings namespace, bound through `ctx.settingsScope`. Turning the switch off persists the preference AND collapses the sidebar to its control rail immediately through `ctx.layout.setSidebarVisible`; the persisted value is re-applied as the boot default once the scope resolves. The mode rail stays visible in the collapsed state, so the sidebar's recoverable minimum never hides the app switcher. The host-side namespace registration lives in this package's node half.

Mode glyphs are self-contained icons in this package in two weights — outline for idle rail entries and the placeholder pages, filled for the rail's active entry (the design-system icon set has no Work/Video/Image/App Store vocabulary); they follow the shared icon contract so swapping in library icons later is local.

## Model Experience

None, as the package is human-only surface chrome and a settings preference. Switching modes changes browser viewing state only; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends provider requests.

## Known Limitations and Deferred Work

- **Placeholder pages** — Work, Video, Image, and App Store render a construction notice; their real surfaces are future work behind the same keyed `mode.page` seat.
- **Boot default applies once** — the persisted sidebar preference is applied at the first scope acceptance; a later settings-document change does not re-collapse an expanded sidebar until the row is toggled.
