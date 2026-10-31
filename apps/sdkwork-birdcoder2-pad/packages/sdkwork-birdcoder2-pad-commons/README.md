# @sdkwork/birdcoder2-pad-commons

Domain-neutral tablet layout primitives: split-view planning, pane-ratio clamping, and
platform touch-target sizes.

- Surface: `pad`
- Layer role: `frontend-commons`
- Standard: `MODULE_SPEC.md`, `APP_PAD_ARCHITECTURE_SPEC.md` section 5.

This package owns no business pages, services, or routes. It must not import `-pc-*`,
`-h5-*`, mobile-framework UI, or another client root's private source.