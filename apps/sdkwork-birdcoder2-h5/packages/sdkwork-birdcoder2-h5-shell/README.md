# @sdkwork/birdcoder2-h5-shell

Mobile route assembly, navigation, AuthGate wiring, shell layout.

- Surface: `h5`
- Layer role: `shell`
- Standard: `MODULE_SPEC.md`, `APP_H5_ARCHITECTURE_SPEC.md`

## Public exports

| Entry | Content |
| --- | --- |
| `.` | Public contract: the route registry, the component-key/icon resolvers, `MobileShellLayout`, the route title resolver, and `BirdCoder2H5AppRoutes`. |

## Model Experience

The shell assembles the route registry from the installed capabilities, renders the mobile
chrome (tab bar and header), and binds each component key to a lazily imported screen. It owns
no capability state and no transport: screens arrive from the capability packages and receive
`BirdCoder2Ports` from the composition root above them.

## Known Limitations and Deferred Work

- Capability screens are assembled through component keys; a capability package that is not
  mounted simply contributes no route.
- Auth-gate placement is a root concern (`src/App.tsx`); the shell only renders the chrome.
