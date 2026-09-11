---
description: "The bundled BirdCoder scene-skill root that makes the composer tag strip's `/birdcoder-…` tokens real, openable skills in desktop and browser sessions."
kind: "package-reference"
---

# @deepseek-ai/dsh-sdkwork-builtin-skills

English | [中文](README.zh.md)

## Summary

Clicks on the BirdCoder tag strip land `/birdcoder-…` names in the composer, and those names only behave like skills when a catalog answers for them. Enabling this root makes all 35 scene skills resolve everywhere, in the desktop and browser profiles alike: each token decorates as a reference, opens its instruction file in the right Sidebar, and injects that body when a prompt leads with it. Workspaces that carry their own same-named skill still win. Add a skill directory instead when a deployment needs names of its own.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

The plugin takes no configuration. The shipped `dsh-web-app` bundle patch inserts its row, so the browser profile and the desktop profile — which layers over the same web bundle — both mount it.

### What the shipped root provides

- **35 scene skills.** `birdcoder-agent-app`, `birdcoder-android-app`, `birdcoder-business-plan`, `birdcoder-cicd`, `birdcoder-codex-plugin`, `birdcoder-courseware`, `birdcoder-daily-dev`, `birdcoder-docs`, `birdcoder-dsh-plugin`, `birdcoder-flutter-app`, `birdcoder-harmonyos`, `birdcoder-html-web`, `birdcoder-image`, `birdcoder-ios-app`, `birdcoder-lesson-plan`, `birdcoder-marketing-poster`, `birdcoder-meeting-notes`, `birdcoder-miniprogram`, `birdcoder-music`, `birdcoder-poster`, `birdcoder-ppt-design`, `birdcoder-product-ppt`, `birdcoder-react-web`, `birdcoder-short-video`, `birdcoder-skill-dev`, `birdcoder-sound-effect`, `birdcoder-tts`, `birdcoder-uniapp`, `birdcoder-unity-app`, `birdcoder-video`, `birdcoder-visual-poster`, `birdcoder-vue-web`, `birdcoder-web-dev`, `birdcoder-workbuddy-app`, `birdcoder-workbuddy-plugin`. Each is one directory holding a `SKILL.md` with `name` and `description` frontmatter.
- **An absolute instruction path per skill.** The catalog forwards the packaged `SKILL.md` path, which the composer uses to preview the skill's instructions in the right Sidebar.

### Observable success and failures

With the row mounted, every shipped name appears in the `/` menu, a `/birdcoder-…` token in the composer decorates as a reference, and clicking that reference opens the packaged `SKILL.md`. Without the row the catalog is empty for any Workspace that is not this repository: the `/` menu lists nothing, the token stays plain text, and the click has nothing to open. Discovery always completes with the full packaged set, because the root is a directory of static files; a missing or unreadable packaged directory yields an empty catalog rather than a partial one.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

This section explains how the bundled root is wired; the observable behavior is fully covered in [Use this package](#use-this-package).

### Design concept

The plugin is a thin adapter over the ordinary directory provider, not a second discovery implementation: it resolves its own `assets/skills` directory from `import.meta.url` and mounts the shared filesystem provider with default roots and watching switched off. It contributes exactly one root at the bundled rank (600), so frontmatter parsing, rank precedence, and the absolute `SKILL.md` paths all behave exactly as they do for a project or user directory. Project and user roots therefore still outrank these copies, and a deployment's own provider rows keep owning local discovery.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin entry: resolves the packaged root, mounts one bundled directory root |
| [`assets/skills/`](assets/skills) | One directory per shipped skill, each holding the `SKILL.md` the host injects |
| — | No runtime invariant companion is published; the skill registry owns registration uniqueness and lifecycle checks, and the packaged set is asserted by the package spec. |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these pages when the package-level contract is not enough. They move from the registry this root registers on to how a skill reaches the model and back to the composer.

- [Skill subsystem reference](../../../docs/subsystems/skills.md) — the registry, provider contract, local discovery priority, and the catalog and tool.
- [skill-filesystem package](../skill-filesystem/README.md) — the directory provider this root reuses, including the bundled rank it occupies.
- [tool-skill package](../tool-skill/README.md) — how a catalog entry reaches the session catalog and the model, and how a leading `/name` injects a body.
- [skill-badge package](../skill-badge/README.md) — the other bundled provider, and the smallest example of one fixed virtual skill.

-----

<a id="model-experience"></a>
## Model Experience

Indirectly, through `dsh-tool-skill`, which renders the provider's catalog entries and any selected body to the model.

#### KV Cache effect

Enabled in the shipped Web and desktop compositions, so every session's request prefix carries the 35 catalog entries this root contributes; loading one inserts that skill's body at the point the tool result renders. Precedence means a same-named project, custom, or user skill replaces the packaged entry in the catalog and in the prefix, while the packaged entry itself changes only on a release.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>


These limits define what the bundled root does not do. They are current package constraints, not a task backlog.

- **A fixed shipped set** — the root contributes exactly the `birdcoder-*` skills packaged with this release; a deployment that needs another scene skill authors a skill directory and adds its own tag, rather than editing the assets here.
- **English-only bodies** — skill instructions are English, as every other skill body in the repository is. The tag labels beside them are localized in the client package, so a localized label can lead to an English body.
- **Two copies of the same skill text** — the authoring copies live under the repository's `.agents/skills/` so checkout-local sessions and other agent tooling keep discovering them, and the package spec fails if a packaged copy drifts from its authoring source.
- **The lowest-precedence rank by design** — the bundled rank loses to project, custom, and user roots, so a Workspace that carries its own `birdcoder-*` skill silently wins for that name; only the catalog entry changes, not the packaged file.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

Adding a scene skill is four edits: author `.agents/skills/<name>/SKILL.md`, copy it to `assets/skills/<name>/`, add the tag to `SCENE_SKILLS` and its label to the locales in `packages/client/ui-sdkwork-app-modes`, and add the name to `SHIPPED_SKILLS` in this package's spec. The tag strip renders only blank-stage sessions, so a session that already has turns never shows the tags at all.

</details>
