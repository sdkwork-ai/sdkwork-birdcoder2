# APP_CLIENT_ARCHITECTURE_ALIGNMENT_SPEC — bundled contract

Authority: `sdkwork-specs/APP_CLIENT_ARCHITECTURE_ALIGNMENT_SPEC.md`, with
`APP_MANIFEST_SPEC.md` §6.1. Distilled for portability; the checkout text wins
when available.

## Application roots (§2)

`apps/sdkwork-<code>-common` (shared, non-runnable), `-pc`, `-pad`, `-h5`,
`-flutter-mobile`, `-mini-program`, `-android-mobile`, `-ios-mobile`,
`-harmony-mobile`, `-uniapp`, `-uniappx`, `-unity`, `-static-web`.

Each root keeps its own bootstrap, shell, package family, host adapters, config
and verification. The package segment appears in every owned package name. The
set is a closed registry: an unregistered root or client architecture is
forbidden; a deferred pattern needs an ADR, governance, tests and registration.

## Manifest alignment (§2, APP_MANIFEST_SPEC §6.1)

| Root | Typical runtime.family / framework | publish.platforms |
|---|---|---|
| `-pc`, `-pad` | web or desktop / react, react-tauri, react-electron, electron | WEB, DESKTOP_* |
| `-h5` (Capacitor) | mobile / react-h5, react-capacitor | H5, H5_WEIXIN, APP_IOS, APP_ANDROID |
| `-flutter-mobile` | mobile / flutter | APP_IOS, APP_ANDROID (+ APP_HARMONY) |
| `-mini-program` | mini-program / weixin-mini-program, alipay-mini-program, multi-mini-program | MP_WEIXIN, MP_ALIPAY, MP_DINGTALK, MP_LARK |
| `-android-mobile` | mobile / android-native | APP_ANDROID |
| `-ios-mobile` | mobile / ios-native | APP_IOS |
| `-harmony-mobile` | mobile / harmony-native | APP_HARMONY |
| `-uniapp`, `-uniappx` | mini-program, mobile or web / uni-app, uni-app-x | MP_*, APP_*, H5 |
| `-unity` | unity per lane | APP_*, DESKTOP_*, WEB, MP_WEIXIN_GAME |
| `-static-web` | web / static-html | WEB |

`runtime.family`, `runtime.framework`, `publish.platforms` and each package's
`runtimeTarget` must match the selected root.

## Adaptive web pair (§2.1–§2.2)

A PC+H5 adaptive web app builds to `dist/<profile>/<envAlias>/` where `<profile>`
is `standalone` or `cloud` and `<envAlias>` is `dev`, `test`, `staging` or
`prod`. A bare `dist/` or an environment-only layout is forbidden for the pair.
Installed surfaces are `<share>/web/{pc,h5}/`; one public origin serves both,
H5 from the H5 root and PC from the PC root, collapsing only when the preferred
SPA is absent.

## Consequences for publishing

- Resolve the app root first, then the build output the root's architecture
  defines; an adaptive web app publishes one selected profile/environment
  directory, never the whole `dist/`.
- The publishing console's type cards are a coarser projection of these roots
  (nine cards). Preserve the manifest's family/framework; map to the card only
  to address the platform.
