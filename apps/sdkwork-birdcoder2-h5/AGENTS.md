# AGENTS.md — sdkwork-birdcoder2-h5

H5/Capacitor application root of BirdCoder2.

- Follow `APP_H5_ARCHITECTURE_SPEC.md` before creating or moving files here.
- H5 is the baseline runtime; Capacitor is a host/release shape. One mobile renderer, one SDK/IAM
  runtime model, one global TokenManager.
- Package names must carry the `h5` segment: `@sdkwork/birdcoder2-h5-*`, `-h5-console-*`,
  `-h5-admin-*`; the Capacitor host is `@sdkwork/birdcoder2-h5-capacitor`.
- Only `sdkwork-birdcoder2-h5-capacitor` may own Capacitor config, plugins, and generated native
  project directories. Generated `ios/` and `android/` must not contain business logic.
- Feature packages must not import Capacitor plugins, WeChat globals, or browser globals directly.
- Never hand-edit `.env.<deployment-profile>.<environment>`; regenerate from `etc/`.
