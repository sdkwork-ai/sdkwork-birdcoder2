# @sdkwork/birdcoder2-pad-admin-core

The `backend-admin` boundary for the tablet root: backend SDK and appbase backend SDK
wrappers, staff route guards, operator context, and audit-facing helpers.

- Surface: `pad` (`backend-admin`)
- Layer role: `frontend-core`
- Standard: `MODULE_SPEC.md`, `APP_PAD_ARCHITECTURE_SPEC.md` section 4.

Only packages in the `-pad-admin-*` family may import this package. App and console packages
must never import, export, construct, or proxy backend SDK clients.