# ENVIRONMENT_SPEC — bundled contract

Authority: `sdkwork-specs/ENVIRONMENT_SPEC.md`. Distilled for portability; the
checkout text wins when available.

## Profiles (§5.1)

A profile id is exactly `<deploymentProfile>.<environment>`:

- deployment profile: `standalone` or `cloud`;
- environment: `development`, `test`, `staging`, `demo`, `production`;
- ten canonical ids. `dev`/`prod` are command aliases, never profile segments.

Each profile carries `environment`, `deploymentProfile`, `profileId`,
`runtimeTarget`; the materialized keys are `SDKWORK_ENVIRONMENT`,
`SDKWORK_DEPLOYMENT_PROFILE`, `SDKWORK_PROFILE_ID`, `SDKWORK_RUNTIME_TARGET`
(and `SDKWORK_<APPLICATION_CODE>_*` equivalents). Browser projections use the
`VITE_` prefix. A mismatch fails before SDK construction.

## URLs (§5.1.0.1, §5.1.4, §6.2–§6.3)

- Development is loopback (`http://127.0.0.1:<port>`); built artifacts use
  domains only.
- Standalone built surfaces are same-origin: page and every SDK base on
  `https://<role>-<suffix>.<base-domain>`; browser origin mode `same-origin`.
- Cloud built surfaces split page and API: page
  `https://<role>-<suffix>.<base-domain>`, API `https://api-<suffix>.<base-domain>`
  (`api-dev`, `api-test`, `api-staging`; production `api.<base-domain>`);
  browser origin mode `cross-origin` with the registered origin family.
- Suffixes: `-dev`, `-test`, `-staging`, `-demo`; production uses the bare role
  host.

## Tokens (§6.1)

Two classes, never interchangeable:

- **Application token** `SDKWORK_ACCESS_TOKEN`: public, committed per profile,
  `alg: none`, `token_class: application`, sent as `Access-Token`. Required in
  every manifest-bearing root; resolve-phase commands never mint or rewrite it;
  packaging embeds it byte-identically; rotation is an explicit regeneration.
- **Session tokens** (access/auth/refresh): private, never committed, never in
  `VITE_*` or public runtime config. The conversation publish uses the signed-in
  session — this skill never handles these values.

## Transport

Plain HTTP is only for development loopback dev servers and local-only desktop
RPC. Deployed/materialized edges are HTTPS only, and a resolved origin must
match the page scheme. Loopback origins are prohibited outside development.

## Preserved ambiguity

`demo` is canonical here, while the host deploy profile rules
(`SDKWORK_DEPLOY_SPEC.md` V17, `DEPLOYMENT_SPEC.md` §2) enumerate fewer
environments. The deploy platform API accepts the five tiers this skill offers;
when a platform rejects one, that is a reported stage, not a silent downgrade.
