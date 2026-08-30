# Agent Note: the desktop roster listed PTC mode twice, and the second entry could not be selected

Status: implemented

English | [中文](2026-08-30-desktop-duplicate-ptc-preset.zh.md)

## Problem

After the second upstream sync, the desktop shell's mode picker offered **two entries named "PTC 模式"**, and the lower one could not be switched to.

Two upstream changes met one fork-owned directory:

1. Upstream renamed code mode to PTC mode ([`3ca9c7d489`](https://github.com/deepseek-ai/deepseek-harness/commit/3ca9c7d489)): the preset directory `code` became `ptc`, and the presentation row's `mode` value became `ptc`. `@deepseek-ai/dsh-agent-tool-presentation` now accepts only `z.union(['native', 'ptc', 'both'])`, so `mode: code` is rejected at mount.
2. Upstream moved the built-in presets into the plugin ([2026-08-20 note](../bug-fix/2026-08-20-plugin-owned-shipped-preset-root.md)): `dsh-agent-presets` prepends its own `presets/` as a `system` root, before `config.roots`.

The desktop shell has carried its own preset root since [`9cb7a27ee2`](https://github.com/sdkwork-ai/sdkwork-birdcoder2/commit/9cb7a27ee2) — `apps/desktop/config/agent-presets`, a snapshot of the then-current `apps/cli` presets, packed into the app because the CLI's own copy did not survive packaging. That snapshot still held the pre-rename `code` directory, whose `preset.yml` had since been aligned to the new wording: `name: PTC 模式`, `order: 2`.

With both roots live, `discoverPresets` de-duplicates **by id, first root wins**. The plugin's root supplied `standard`, `ptc`, `minimal`, `cordis`; the desktop root supplied `standard`, `code`, `minimal`, `cordis`. Three ids were shadowed by the plugin; `code` had no namesake, so it survived — producing a five-row roster whose second root's entries are appended after the first root's:

| order | id | display name | state |
| --- | --- | --- | --- |
| 1 | `standard` | 标准模式 | healthy |
| 2 | `ptc` | PTC 模式 | healthy |
| 3 | `minimal` | 极简模式 | healthy |
| 4 | `cordis` | 创造模式 | healthy |
| 2 | `code` | PTC 模式 | `mode: code` rejected by the schema → mount fails |

The bottom entry is the one users could not select: `select` recomposes the blank session's agent from the preset, which mounts it, and the mount rejects the presentation row's config.

The shadowing also meant the desktop root's `standard` and `cordis` were **dead configuration** — stale copies (no `command-goal`, no `modelSelectionSettings`, `fetch: false`, and a `SKILL.md` still naming a `code` preset) that no edit could affect, because the plugin's copies won every shared id.

## Decision

- **Delete `apps/desktop/config/agent-presets/code`.** It is the pre-rename copy of `ptc`, not a fork feature; `ptc` is the id the plugin, the rosters, and the picker all speak now.
- **Mirror the plugin's presets into the desktop root**, so the four ids and their bytes are identical on both sides: `standard`, `ptc`, `minimal`, `cordis` (including `cordis`'s two bundled skills and the `SKILL.md` wording). The desktop copies were behind upstream, not deliberately different — the desktop shell is the Web profile plus a transport overlay, so a capability the Web roster grants belongs in the desktop one too (`command-goal`, subagent model selection, web `fetch`).
- **Make the desktop root the only `system` root**: the host boot overlay now sets `includeShippedRoot: false` alongside `roots`. One root means the roster is a directory listing with no shadowing rule to reason about, and no id can appear under two names. It also keeps the development and packaged rosters identical: `config/agent-presets` is an explicit entry in `electron-builder.yml`'s `files`, whereas the plugin's `presets/` reaches the packaged app only through dependency collection, on which no desktop gate currently asserts.
- **Assert the mirror in the parity test**: `composition-parity.spec.ts` now compares the two directories file-for-file and rejects two presets publishing one display name, and `apps/desktop/tests/host.spec.ts` asserts exactly one `system` root. Upstream gaining or renaming a preset fails the test at the desktop boundary instead of shipping a roster that lists the same capability twice — or omits it.

The desktop root stays rather than being deleted in favour of the plugin's own: the packaged app's dependency closure is hand-maintained (`scripts/sync-pack-deps.mjs`) and the packaged-boot probe does not check presets, so making session creation depend on `node_modules/@deepseek-ai/dsh-agent-presets/presets` would trade a visible duplicate for a silent empty roster.

## Testing

- `packages/bundle/sdkwork-desktop-app/tests/composition-parity.spec.ts` — 6 passed, including the new mirror check.
- `packages/preset/agent-presets/tests/shipped-root.spec.ts` — 4 passed (the plugin's own root is untouched).
- `apps/desktop/tests/host.spec.ts` — new assertion that the composed roster carries exactly one `system` root.
- A throwaway discovery run over `apps/desktop/config/agent-presets` against the desktop package's dependency closure printed four healthy presets — `standard` (标准模式), `ptc` (PTC 模式), `minimal` (极简模式), `cordis` (创造模式), none `broken` — and was then removed.

## Follow-up

`apps/desktop/release-build/` is a stale unpacked build and still carries the old `code` directory; it is gitignored and is replaced by the next `electron-builder` run.
