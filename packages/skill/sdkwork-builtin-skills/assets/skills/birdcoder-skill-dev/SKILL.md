---
name: birdcoder-skill-dev
description: Use when authoring or editing agent skills — SKILL.md packages with YAML frontmatter (name, description) per the open Agent Skills format, including deciding when a capability should become a skill versus a tool or command.
---

# Skill Development

Author a skill that an agent loads reliably: a directory whose SKILL.md carries `name` and `description` frontmatter plus focused instructions.

## Format

- Frontmatter: `name` (lowercase, hyphen-separated, unique) and `description` (when to use it — this is the trigger the model matches against).
- Body: short, imperative instructions. Reference supporting files from the body instead of inlining large content.
- One skill owns one capability; split multi-purpose skills.

## Workflow

1. Write the description first: the situations that should trigger the skill, phrased concretely.
2. Draft the body as steps an agent can follow without context from you; verify every referenced file exists.
3. Name product skills with the `birdcoder-` prefix; keep framework-internal skills in their own namespace.
4. Test by invoking the skill in a real session and tightening the description until triggering is reliable.
