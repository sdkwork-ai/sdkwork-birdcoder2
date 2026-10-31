# assets/

Application asset root for `sdkwork-birdcoder2-pad`, governed by `APP_ASSETS_SPEC.md`.

| Directory | Purpose |
| --- | --- |
| `resources/` | Packaged runtime resources referenced by the tablet host. |
| `media/` | Store and catalog source media (icons, covers, screenshots, previews). |
| `capture/` | Capture configuration and per-window-class evidence. |
| `capture/tablet/` | Tablet adaptation screenshots declared by `specs/tablet-adaptation.spec.json`. |

Phone screenshots scaled up as tablet screenshots are forbidden. Store media must represent
the tablet experience honestly.