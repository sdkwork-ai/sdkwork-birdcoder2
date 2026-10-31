# @sdkwork/birdcoder2-pad-shell

Tablet app shell: navigation rail/sidebar selection, master-detail pane counts, and route
metadata assembly for the app surface.

- Surface: `pad`
- Layer role: `frontend-shell`
- Standard: `MODULE_SPEC.md`, `APP_PAD_ARCHITECTURE_SPEC.md` sections 5 and 9.

The shell owns layout and route composition only. It does not call backend SDKs, own
business services, or mount console/admin routes.