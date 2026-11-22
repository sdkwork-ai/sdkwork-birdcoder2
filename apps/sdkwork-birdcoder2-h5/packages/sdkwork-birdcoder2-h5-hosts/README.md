# @sdkwork/birdcoder2-h5-hosts

Host fleet capability: enroll a machine running the host runtime, list the fleet, rename or revoke a host.

- Surface: `h5`
- Layer role: `feature` (capability `host-fleet`)
- Standard: `MODULE_SPEC.md`, `APP_H5_ARCHITECTURE_SPEC.md`

## Public exports

| Entry | Content |
| --- | --- |
| `.` | Public contract: the fleet provider/hook, its failure projection, the two screens, the route contributions, and the localized message resolution. |
| `./state/hostsState` | `HostsProvider` / `useHosts` (consumed by the app root above the router). |
| `./routes` | `app.host.fleet.*` route contributions the shell registers. |
| `./screens/HostsPage`, `./screens/HostEnrollPage` | The fleet list and pairing-code enrollment screens. |
| `./messages/hostsMessages` | The capability's localized copy. |

## Model Experience

The capability receives `BirdCoder2Ports` as a prop and never imports the generated SDK or a
platform global. It lists the owner's hosts, applies inline rename and revoke, and walks the
two-step enrollment flow: request a pairing code from the app API, show it, and let the host
runtime redeem it on the Internal API. The lease the host receives never reaches the phone.

## Known Limitations and Deferred Work

- Enrollment displays the pairing code; it does not poll the enrollment status after handoff.
- Capability copy is localized through its own message module, not a shared i18n catalog.
