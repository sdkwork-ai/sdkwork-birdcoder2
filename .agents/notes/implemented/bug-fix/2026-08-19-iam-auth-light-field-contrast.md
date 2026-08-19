# Agent Note: IAM auth light-theme field contrast and QR rail chrome

Status: implemented

English | [中文](2026-08-19-iam-auth-light-field-contrast.zh.md)

## Problem

BirdCoder light theme collapses `--dsw-alias-bg-base`, `--dsw-alias-bg-layer-1`, `--dsw-alias-bg-layer-2`, and `--dsw-alias-bg-layer-3` to the same white (`--dsw-static-neutral-bluish-00`). The IAM login overlay mapped field and QR-frame fills onto those layer tokens. sdkwork auth inputs also paint `border-0` with an inline `borderWidth: 0` on the password frame, so `fieldBorderColor` never showed. The result in light mode was a white control on a white shell: the username and password fields were effectively invisible. Mapping `qrFrameBackgroundColor` onto `bg-layer-2` painted that same white onto the branded dark QR rail, so the well around the white QR canvas disappeared into the shell padding.

Painting the QR column `#09090b` in both schemes then made light mode show a black rail. The sdkwork panel is `rounded-lg` on a `rounded-xl` white shell; the dark fill plus inner radius punches white crescents out of the shell corners.

The client bundle injects CSS Modules only. A plain `sdkwork-auth.css` side-effect import is dropped, so a border override that lives in a non-module stylesheet never reaches the running overlay. Tailwind class names on `slotProps` also never emit: the web sheet's `@source` scans the sdkwork packages, not `ui-iam`.

## Decision

`packages/client/ui-iam/src/client/auth-appearance.ts` overlays form-column chrome per scheme. Light fields and oauth cards use `--dsw-alias-bg-overlay` (`bluish-150`) against a `bg-layer-2` shell. Dark fields use `--dsw-alias-bg-layer-1` (one step off the elevated shell). Borders use `--dsw-alias-border-l2`. Placeholders use `--dsw-alias-label-tertiary` because light `--dsw-alias-label-dimmed` is a near-white fill, not hint text.

The QR column uses the same `bg-layer-2` fill and primary text as the dialog shell. The frame around the white canvas is transparent (no inset well, no border). Aside `slotProps` drop the sdkwork gutter (`padding: 0`) and leave the aside transparent. `sdkwork-auth.module.css` (imported from `SdkworkAuthThemeFrame`) restores a 1px field border with `:global` selectors, squares the QR panel radius, overrides `bg-zinc-950` / `text-white` / `text-zinc-300` / `bg-zinc-900/70` inside the QR aside, and keeps the canvas white under `[data-testid="sdkwork-auth-qr-frame"]`.

This is the field and QR-chrome half of the appearance overlay described in [the IAM auth plugin note](../feature/2026-08-16-sdkwork-iam-auth-plugin.md).

## Alternatives considered

**Keep mapping fields to `bg-layer-1` and rely on `fieldBorderColor`.** Rejected: sdkwork inputs are `border-0` with inline `borderWidth: 0` on the password frame, so the border token is a no-op and light layer-1 is the same white as the shell.

**Map light fields to `--dsw-alias-bg-module-platform`.** Rejected: light `module-platform` is `bluish-60` (`rgb(245, 246, 247)`), too close to the white shell to mark the control when the border override is missing.

**Keep the sdkwork dark QR rail in both schemes (solid `#09090b`, dark well).** Rejected: light mode then shows a black column, and the panel's `rounded-lg` leaves white crescents against the shell's `rounded-xl` corners. Boxing the white canvas in a second inset well is the same extra chrome: the bitmap already sits on a white square.

**Ship the border and rail override as a plain `.css` import, or stretch the QR wrapper with Tailwind `[&>div]:h-full` on `slotProps`.** Rejected: tsdown injects CSS Modules only, and the web Tailwind `@source` list does not include `ui-iam`, so neither path reaches the running overlay.

**Change sdkwork `form-control-styles` to honor `--sdkwork-auth-field-border-color`.** That is the cleaner API completion, and sdkwork's own page test pins `border-0`. A birdcoder overlay can restore the border without forking that contract.

## Consequences

- Light login fields are an overlay fill with an `l2` border against a white shell; dark fields stay a step off the elevated shell.
- The QR column matches the dialog shell. The white canvas sits on that column with no extra frame fill; the outer QR card is square so the shell radius clips the column without a color mismatch at the corners.
- `sdkwork-auth.module.css` uses `!important` against sdkwork's `border-0` and the password frame's inline `borderWidth`. A later sdkwork change that honors the border CSS variable can drop that override.

## Testing

`packages/client/ui-iam/tests/auth-appearance.client.spec.ts` pins the overlay light field fill, the dark `bg-layer-1` field fill, the shell-matched QR panel with a transparent frame, and the CSS Module selectors for the field border and flush QR column. `apps/web/tests/ui-iam.e2e.ts` asserts the light username field computes to overlay `rgb(233, 236, 242)` rather than white.
