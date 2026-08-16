# @deepseek-ai/dsh-client-ui-layout

English | [中文](README.zh.md)

Shell plugin: four-column AppFrame (mode rail, sidebar, conversation, details; drag handles and concession chain) plus the `ctx.layout` panel-geometry service; it registers into the runtime-owned `root` slot and declares `mode.rail`, `sidebar`, `conversation`, `mode.page`, `details`, and `shell.overlay`. The sidebar resize boundary is an invisible hit strip, while the details boundary retains its floating pill; only details shrinks during concession and then auto-closes. A closed sidebar retains a 56px control rail while details closes to zero width. The mode rail is a fixed leftmost 56px track: it never participates in the concession chain and stays mounted whether the sidebar is collapsed or not. The package also seats the theme presenter: it consumes resolved `ctx.theme` snapshots and projects them onto the document (`html { color-scheme }` for native UA chrome, `body[data-ds-dark-theme]` from the active color scheme, the theme's alias tokens as inline variables on body, and one owned `<meta name="theme-color">` whose content follows the computed body background). Measuring after palette and token application keeps the rendered background as the single color authority; disposing the presenter removes its metadata node with its other global writes.

AppFrame always mounts the mode rail, the conversation column, and the details column; a connected Session renders through `SessionProvider`. The transient layout store starts the sidebar at its default width and details closed, and it never reads or writes `localStorage`. Hero and other unselected states also derive a zero rendered details width without changing that stored preference. AppFrame retains the last non-blank Session id across those states: the first Session remains closed, an explicit details action opens the contract default width, returning to the same Session restores its unchanged width, and selecting a different Session closes details before paint. The center column renders the active mode's surface: the conversation in code mode, and the keyed `mode.page` slot dispatched by the mode id otherwise (the conversation unmounts; its state lives in the runtime object layer and restores on return). Details renders at a derived zero width while a non-code mode owns the center, with the preference untouched and restored on return to code. The mode state (`mode` field and `setMode` action) lives in the layout store, so the rail and the center column share one store channel; `ctx.layout.setSidebarVisible` is the persisted sidebar-visibility write (hidden collapses to the control rail, the layout's recoverable minimum). The conversation owner share is empty, the sidebar owner share contains only `collapsed` and `width`, and the mode rail owner share contains `mode` and `setMode`; registrants obtain business data from standard hooks and actions from their own inject faces.

The `/client` exports are the plugin body (`apply`/`inject`), `LayoutController`, the `AppModeId` vocabulary, and the owner-share interfaces. AppFrame, the panel store, and the concession solver remain package-internal.

## Model Experience

None, as the layout shell manages browser viewing state; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **Panel geometry is transient** — reload restores the sidebar default and details closed; switching between distinct Session ids also closes details and forgets its dragged width, while unselected surfaces render details at zero width without modifying geometry.
- **The active mode is transient** — reload restores the code mode; the persisted sidebar-visibility preference (ui-app-modes' row) is applied at boot, but the mode itself is not persisted.
- **Concession-chain auto-close derives a zero width without touching the preferred width** — the panel restores itself when the window widens; consumers must not read the stored details width as the rendered truth.
- **No scroll anchoring during squeeze reflow** — layout changes may move the reader's viewport.
