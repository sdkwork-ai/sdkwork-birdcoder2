# @sdkwork/birdcoder2-pad-console-core

User-facing console runtime helpers: console SDK providers, permission hints, and console
session helpers.

- Surface: `pad` (user console)
- Layer role: `frontend-core`
- Standard: `MODULE_SPEC.md`, `APP_PAD_ARCHITECTURE_SPEC.md` section 4.

This is not the `backend-admin` boundary. Console packages must not import backend SDK
wrappers, staff features, or admin resources.