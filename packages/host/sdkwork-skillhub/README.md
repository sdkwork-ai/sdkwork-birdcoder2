---
description: "Host half of the SDKWork Skills page: the SkillHub catalog proxy and the local skill installer (install, enable, disable, uninstall, upstream detail) as five owner-only webServer routes."
kind: "package-reference"
---

# @deepseek-ai/dsh-sdkwork-skillhub

English | [中文](README.zh.md)

## Summary

`dsh-sdkwork-skillhub` is the Host side of the SDKWork Skills page
([`dsh-client-ui-sdkwork-markets`](../../client/ui-sdkwork-markets/README.md)).
SkillHub sends no CORS headers and a browser cannot write the Harness skill
root, so both jobs live here: it proxies the upstream catalog reads the page's
detail drawer needs, and it installs a catalog skill's real files into
`$DSH_HOME/skills` — the root the bundled skill provider already scans — using
the same rules as the SkillHub market: a version-pinned file manifest, a
per-file size and SHA-256 check, a staged directory swapped in only after every
file passes, and enable/disable as a directory move between the enabled root
and this package's disabled root.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

<a id="use-this-package"></a>
## Use this package

Mount it in a composition that carries `webServer`; the web-app bundle already
does, beside the Skills page's browser half. All routes require an owner Peer
and answer `403` to any other caller:

| Route | Method | Purpose |
| --- | --- | --- |
| `/sdkwork-skillhub/api/installed` | GET | Everything the enabled and disabled roots hold, with ledger metadata. |
| `/sdkwork-skillhub/api/install` | POST | `{ packageKey, version? }` — install or update one skill. |
| `/sdkwork-skillhub/api/uninstall` | POST | `{ packageKey }` — remove the directory and its ledger row. |
| `/sdkwork-skillhub/api/enabled` | POST | `{ packageKey, enabled }` — move the directory between roots. |
| `/sdkwork-skillhub/api/detail` | GET | `?packageKey=&version=` — versions, security reports and the file list. |

`packageKey` is the catalog's `skillhub.<handle>/<slug>`. `/` cannot appear in
an upstream handle or slug, so the split is unambiguous; a key that does not
carry that shape is refused with `unsupported-coordinate` instead of guessing a
skill.

```yaml
- name: '@deepseek-ai/dsh-sdkwork-skillhub'
  config:
    apiBaseUrl: https://api.skillhub.cn
```

Omitted roots resolve under the Harness home: enabled is `$DSH_HOME/skills`,
disabled and the ledger are under `$DSH_HOME/data/sdkwork-skillhub/`.

### When to choose it

Choose it wherever the Skills page must install skills instead of only adding
them to a cloud library. Do not mount it twice: two installers would race the
same ledger.

<a id="understand-the-implementation"></a>
## Understand the implementation

- `src/skillhub.ts` — upstream client. It bounds every read (per-file 16 MiB,
  per-version 256 MiB, 2,000 files), rejects paths that could escape the install
  directory, and pins each file request to the manifest's version. A download
  without `version` silently returns the latest file, which would mix versions
  inside one directory.
- `src/installer.ts` — install engine. Files are written into
  `.staging-<uuid>` beside the target, verified against the manifest's size and
  SHA-256, and only then renamed over the previous directory, which is restored
  if the rename fails. The ledger (a JSON file under the Harness home) records
  the exact version, file count, byte count and install time; the enabled state
  is not stored — it is the directory's location, so the disk always states the
  fact.
- `src/index.ts` — the plugin: config schema, owner gate, bounded JSON bodies,
  and one `skills/change` emission after every mutation so catalog observers
  re-read without a restart.
- `src/shared.ts` — route paths and wire types shared with the browser package
  through the `./shared` subpath.

<a id="model-experience"></a>
## Model Experience

None: the package adds no tools, prompt content or session events. It writes
ordinary skill directories, so the model sees an installed skill exactly as it
sees a hand-written one — the skill list of the session that starts afterwards.

#### KV Cache effect

None; nothing this package writes enters a request before the next session's
skill prompt assembly, which is the existing provider's behavior.

<a id="known-limitations-and-deferred-work"></a>
## Known Limitations and Deferred Work

- **Installs are visible from the next session.** A running session resolves its
  skill list once, so the page reports a restart-required notice after an
  install, matching the SkillHub market.
- **Version choice is per install, not an upgrade policy.** The drawer lists
  upstream versions and installs the one a person picks (including older ones);
  nothing upgrades automatically.
- **Skills are fetched from SkillHub at install time.** The mirror in
  `sdkwork-skills` carries catalog metadata, not file content; an offline
  installation is not supported.
- **A sanitised package key is not installable.** A record whose upstream handle
  or slug needed sanitising (or whose key carries a collision suffix) is listed
  but refused with `unsupported-coordinate`; it is not guessed.
- **Local imports are listed, not managed.** A directory a person copied into
  `$DSH_HOME/skills` shows up in the installed list with no version and no
  ledger row; enable/disable and uninstall still apply to it.

<a id="dev-note"></a>
## Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The installer deliberately reuses the Harness skill root instead of a private
directory: the filesystem skill provider discovers a bundle by its `SKILL.md`
frontmatter, so a skill installed here appears beside hand-written skills and
stays after this plugin is disabled. Enable/disable therefore moves whole
directories between two roots under the same Harness home, and the ledger is a
cache of install metadata rather than the source of truth for state.

The routes are same-origin WebServer routes rather than Typert remote methods
because the browser side is a plain catalog page and the payloads are
file-shaped (detail, file lists); the shared path constants keep the two halves
from drifting, and `tests/installer.spec.ts` exercises the engine against a
fixture upstream, including the tampered-file and staging-cleanup paths.

</details>
