# AGENTS.md — sdkwork-birdcoder2-pc

PC browser/desktop/tablet application root of BirdCoder2.

- Follow `APP_PC_ARCHITECTURE_SPEC.md` before creating or moving files here.
- Root `src/` stays thin: bootstrap, providers, route assembly, shell registration, AuthGate,
  environment selection, SDK client construction, IAM runtime wiring, host adapter registration.
  Business screens, services, routes, i18n, and state live in `packages/`.
- Package names must carry the `pc` segment: `@sdkwork/birdcoder2-pc-*`,
  `@sdkwork/birdcoder2-pc-console-*`, `@sdkwork/birdcoder2-pc-admin-*`.
- App/console packages consume app SDKs; only `pc-admin-*` packages (the `backend-admin`
  boundary) may consume backend SDKs.
- Never hand-edit `.env.<deployment-profile>.<environment>`; regenerate them from `etc/`.
- Never commit secrets, tokens, signing keys, database URLs, or Redis credentials.
