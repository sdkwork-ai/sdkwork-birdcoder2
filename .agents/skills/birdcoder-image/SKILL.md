---
name: birdcoder-image
description: Use when the user asks to generate or edit an image — fixes the deliverable set and specs with the user, builds one concrete prompt per request, maps the aspect ratio and size, carries reference images and accepted anchors across a series, calls the session's image generation tool, and reviews each result before delivery.
---

# Image Generation

Turn a request into a delivered image, or a coherent set of images. The session's image generation
tool renders; this skill owns the decisions that make the result match the brief: what is produced,
at which size, from which references, and whether it passes review.

Deeper material, read only when the task needs it. The paths are relative to this skill's directory,
which the skill catalog reports as an absolute path: an installed skill resolves `references/...`
there, never against the session working directory.

## When to use

Use this skill when the user asks for:

- a new image from a description — a poster, illustration, product scene, app icon, or game asset;
- an edit, variant, restyle, composite, or new scene built from one or more supplied images;
- a set that must read as one series — the same character, product, or subject, or one unified
  style across several deliverables;
- an e-commerce detail page or Amazon A+ module stack built from one product base image.

Do not use it for:

- video, animation, or audio — those are the video and audio capabilities;
- erasing text or a watermark, denoising, upscaling, restoration, retouching, or matting a supplied
  photo — those preserve pixels, and regenerating the picture destroys them;
- a logo family, mascot turnaround, or full visual-identity package — one image is not the
  deliverable;
- a session with no image generation tool — report the missing capability instead of substituting a
  written description or a placeholder graphic.

## Inputs

- The request: subject, action or state, environment, visual style, lighting and composition, mood,
  on-image copy, requested count, and the target language.
- Reference images as URLs, in the order the user supplied them.
- Anchors from earlier turns: the accepted image URL together with the style description frozen
  beside it.
- The batch spec confirmed before generating: count, aspect ratio, pixel size, reference roles, and
  language.
- The session's image generation tool. When the session mounts the SDKWork Generations MCP server
  (`generations`), prefer `mcp__generations__image.create` and `mcp__generations__image.retrieve`:
  `create` takes `prompt`, `size`, `aspectRatio`, `imageCount`, `quality`, `seed`, and
  `referenceImages`; `retrieve` takes `generationId`, `wait`, and `waitTimeoutSeconds`. Otherwise
  use the session's own image tool with the equivalent arguments.

| File | Read when |
|---|---|
| [references/series-consistency.md](references/series-consistency.md) | the deliverable is a set — the same character, product, or subject identity, or one unified style across several pieces |
| [references/ecommerce-detail.md](references/ecommerce-detail.md) | the deliverable is an e-commerce detail page or Amazon A+ module stack |

## Workflow

1. Classify the request: single image, edit or derived image, series, e-commerce module set, app
   icon, or standalone poster. Re-classify when the user switches deliverable mid-conversation.
2. Read the matching reference from this skill's directory when the deliverable is a set or an
   e-commerce module stack. Both are dependency chains, not independent images.
3. Fix the batch and ask once. State what is produced and how many, every spec fixed for this batch
   — aspect ratio, pixel size, count, quality, and any default applied — and the materials used,
   including every reference image and anchor, or that the batch is pure text-to-image. Put the
   spec in the question text, not only inside an option description. Wait for the answer; one
   confirmation covers the batch, and a rework, a scale-up, or a new batch needs a new one.
4. Build one prompt per request:
   - a complete, detailed description passes through verbatim; do not expand it;
   - a vague request is filled along the dimensions the user left open: subject, action or state,
     environment, visual style, lighting and composition, color and mood, render detail;
   - attributes the user fixed — subject, color, count, gender, breed, copy — are never changed by
     enhancement; raise the conflict instead of deciding for the user;
   - with references, describe what changes, not the whole picture again;
   - write the exact pixel size into the prompt as well as into `size`.
5. Map the spec to tool arguments: `aspectRatio` from `1:1`, `4:3`, `3:4`, `16:9`, `9:16`, `3:2`,
   `2:3`; `size` as `WxH`; `imageCount` as the confirmed count; `quality` only when the tool
   supports it; `seed` only for reproducibility or a deliberate variation; `referenceImages` with
   one URL per image in user-visible order. When the user named no ratio, infer it from the
   composition: a portrait or vertical subject takes a portrait frame, a landscape or wide scene
   takes a landscape frame, and everything else takes a square. A scene that fixes an exact size
   wins over the inference, and that size goes into every prompt.
6. For a series, produce the anchor first and get it accepted, then derive each remaining piece
   from the anchor as a reference image, one request per semantic role, in sequence. When one
   request returns several images, they are candidates for that one role; never assign them to
   different roles by order. Never fan out independent text-to-image requests for a set.
7. Generate once per prompt. When the tool returns a generation id whose result is still pending,
   retrieve that id until it settles within the wait budget; never resubmit the prompt.
8. Review each result from the returned image, not from the prompt: the named subject and elements
   are present, the actual size matches the confirmed spec, no specification text is rendered, and
   on-image copy is readable at display size. Review a set for frame uniformity, preserved
   invariants, series consistency, and near-duplicate images.
9. Deliver the images, the accepted prompt per semantic role, the count and actual size, and a
   verdict per piece. Whether to redo a piece is the user's decision.

## Rules

- Count discipline: the default is 1. Never add images the user did not ask for. "A few options"
  means variant mode — one shared style anchor, local differences. "A set", "series", or "matching"
  means set-consistent mode — one frozen core style description reused across pieces. When the
  signal is unclear, choose set-consistent.
- Frame lock: every piece in one set uses the same aspect ratio and size. A piece that drifted is
  regenerated, not accepted with an explanation.
- Reference images are hard constraints. Pass all of them; never silently drop, sample, or dedupe.
  Above the tool's reference limit, state the limit and keep the first N in user-visible order, or
  ask which to keep.
- When references carry different jobs, say so in the prompt: image 1 subject reference, image 2
  style reference, image 3 composition reference.
- Keep the deliverable classes apart: an app icon is a square, single-focus system asset; a logo,
  mascot, or full visual-identity package belongs to a design workflow, not this one; a matched
  small-size UI icon set is out of scope. A carousel hero is not a detail-page module, and listing
  copy is a text deliverable.
- Visual quality baseline, unless the request sets stricter rules: one primary focal subject per
  image; one deliberate composition — rule of thirds, centered product, diagonal motion, or
  frame-in-frame — carried through the whole image; a stated light direction and mood instead of
  "nice light"; a controlled background that serves the subject, free of noise and clutter that
  blurs at thumbnail size; restrained visible copy with deliberate negative space.
- A fidelity object keeps its shape, proportion, material, color, mark, and real on-image text;
  only scene, layout, annotation, and context change.
- A text description never substitutes for a reference image. "The previous one" or "that style"
  without the actual URL is not a reference, and a set built on it drifts.
- If a file cited from this skill's directory cannot be read, report the missing file and continue
  with the rules on this page; never invent the missing content.
- On-image text keeps its content, language, punctuation, and case exactly. Keep it short, well
  spaced, and high contrast. Never render specification text into the picture: color values, font
  names, field labels such as "title" or "subtitle", size annotations, grid lines, safe-area
  guides, structural notes, prompt fragments. Only copy meant for a viewer appears.
- Series consistency rests on reference images, not prose: freeze the subject and style
  description into one block and reuse it verbatim in every derived prompt, and list the invariants
  explicitly — proportions, signature features, palette, style.
- E-commerce module stacks: lock one frame and write its exact size into every module prompt;
  derive every module from the user's product base image and state that the product's appearance
  must not change; plan distinct photographs per module — hero, scenes, three or more detail
  close-ups, and a size shot — so no two modules reuse one photograph; a size module with real
  size steps is mandatory for apparel; pass the product base image in `referenceImages` for every
  module.
- Never retry a create blindly. After a timeout or an in-flight result, retrieve the original
  generation. A tool call that never returned an id is an unknown outcome and is reported, not
  retried as a new generation.
- Do not auto-redo a result the user rejected. Ask what to change first.
- Never fabricate a URL, a result, or a success. Without a returned image URL there is no delivered
  image.
- User-facing copy says "generate an image" and never exposes vendor names, model ids, tool names,
  generation ids, or queue mechanics. Answer in the user's language unless the request fixed
  another one.

## Verification

Accept a result only when:

- the delivered count equals the confirmed count;
- each actual pixel size equals the confirmed aspect ratio and size;
- the prompt that produced each accepted image is recorded for its semantic role;
- a set has exactly one accepted anchor, and every derived piece was generated with it as a
  reference;
- no specification text appears in any image, and on-image copy is readable at display size.

## Output

Report the confirmed deliverable set, the accepted prompt per semantic role, each delivered image
with its actual count and size, and the per-image and set verdicts. State every piece that missed
its brief.
