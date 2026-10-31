# tests/

Application-level integration, tablet adaptation, runtime, route, package-boundary,
host-adapter, config, and release verification tests.

- `tests/tablet/` validates the tablet adaptation contract, window classes, and host
  capability fallbacks. It is the `evidence.tests` path of
  `specs/tablet-adaptation.spec.json`.
- `tests/config/` validates the environment/profile matrix, manifest runtime targets, and
  public/private separation.