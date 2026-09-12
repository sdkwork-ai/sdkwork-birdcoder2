# sdkwork-birdcoder2-h5

H5 mobile web application root for BirdCoder2, with Capacitor as the native host/release shape.

Authority: `APP_H5_ARCHITECTURE_SPEC.md` §2, `APP_CLIENT_ARCHITECTURE_ALIGNMENT_SPEC.md` §2,
`APPLICATION_SPEC.md`. Package UI rules: `APP_MOBILE_REACT_UI_SPEC.md`.

## Role in the Adaptive Web pair

Per `APP_CLIENT_ARCHITECTURE_ALIGNMENT_SPEC.md` §2.1 every module that exposes browser UI on a
public origin must ship **both** `sdkwork-birdcoder2-pc` and `sdkwork-birdcoder2-h5`. Selection is same-origin by device
class: mobile → H5 (fallback PC), desktop → PC (fallback H5).

## Standard root layout

```text
sdkwork-birdcoder2-h5/
  .sdkwork/            # application skills and plugins
  bin/                 # ios/ and android/ operational helpers
  etc/                 # source-controlled deployment profile projection
  config/
    browser/           # public browser runtime-env templates
    host/              # Capacitor platform templates, permission and deep-link metadata
    server/            # only when this root owns a server/preview process
    container/         # only when this root owns a container process
  docs/ public/ scripts/ sdks/ specs/ tests/
  src/                 # root shell entry and composition boundary only
  packages/            # core, commons, shell, capability, console, admin, capacitor host
  index.html vite.config.ts
```

## Package family

| Package | Role |
| --- | --- |
| `@sdkwork/birdcoder2-h5-core` | Runtime/bootstrap, SDK client construction, appbase IAM runtime, global TokenManager, host adapter fallbacks. |
| `@sdkwork/birdcoder2-h5-commons` | Shared mobile presentation primitives, safe-area and gesture helpers. |
| `@sdkwork/birdcoder2-h5-shell` | Mobile route assembly, navigation, AuthGate wiring. |
| `@sdkwork/birdcoder2-h5-capacitor` | **The only** package allowed to own Capacitor configuration, plugin implementation, generated native project directories, and platform-specific host implementations. |

## Deployment profiles

Both `standalone` and `cloud` are supported; `cloud` is the default. Browser output emits into
`dist/<deployment-profile>/<envAlias>/`. H5 browser output is a Web artifact even on iOS/Android
browsers; only the Capacitor host produces IPA/APK/AAB.

## Derived client env

`.env.<deployment-profile>.<environment>` files are derived, never hand-edited:

```bash
node ../../../sdkwork-specs/tools/materialize-client-env.mjs --root ../../.. --check
```

## Scaffold status

Standard-layout scaffold: layout, manifest, profile projection, host templates, and the package
family boundary exist. The renderer, capability packages, and the Capacitor native host are not
implemented yet.
