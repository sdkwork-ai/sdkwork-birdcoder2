# E-commerce Detail Pages And Amazon A+ Modules

Produce a stack of equal-frame detail modules from one product base image, so the modules read as
one continuous page rather than a set of unrelated banners.

## Product fidelity is the precondition

The scene exists to preserve the product. Every module derives from the same base image, and the
product itself never changes. When the base image is the user's own photograph, fidelity is also a
marketplace compliance requirement.

Where the base image comes from, decided before generating anything:

- The user supplied a product photograph — use it; it is the only source of truth.
- The user has no photograph — ask for one. If the product does not exist yet, get permission,
  generate a base image once, and lock it after the user accepts it. Every module then derives
  from that locked base.

Every module request carries that base image in `referenceImages`. Never degrade a module to
text-to-image, because each module would then draw a different product. When the base image cannot
be passed, stop the scene before generating any module and say that product consistency cannot be
guaranteed.

## Scope boundaries

This scene produces detail-page and A+ module images: the below-the-fold module narrative.

It does not produce:

- carousel hero images — a different logic: thumb-visible hook, high impact, little text;
- listing copy, titles, bullet points, descriptions, or backend keywords — those are text
  deliverables;
- keyword research or spreadsheet files;
- a redesigned or invented product.

## 1. Lock one frame for the whole stack

A credible detail page is equal-width modules stacked into one continuous page. Lock the frame
before rendering:

- One aspect ratio and one pixel size for every module, not merely the same width. A common
  standard module is landscape at roughly 1.6:1; use a wider frame at the same height when the
  layout needs it.
- No module drifts to another ratio or size — no portrait, no square, no taller strip.
- Write the exact pixel size into every module prompt.

Size drift is the first cause of a stack that reads as separate posters. Verify it per module
before delivery.

## 2. Design dense elements into forms the model can draw

Image generation is unreliable at dense multi-row tables, precise icon grids, and leader lines
anchored to exact coordinates. Without a code-composited layer, do not ask for those forms.

- **Sizes and specs** — use a size band: a clean strip holding a few large, well-spaced labeled
  numbers. Do not use a dense multi-row table. When real size steps span many rows, synthesize a
  few representative ranges.
- **Icons and selling points** — one row of four to six clean icons with short labels and generous
  spacing. Do not use a tight precision grid; keep every icon simple and in one style.
- **Callouts and detail markers** — numbered badges beside the detail, each with a short label.
  Do not use pixel-anchored leader lines. Place badges in clear space, never over a face.
- **Text** — short headline, subtitle, and note, with high contrast and generous space. Avoid small
  dense type that will blur.

Decision rule: when a form only looks right at pixel precision, replace it with a loose form the
model draws cleanly.

## 3. Module slots and the buyer's decision arc

Plan one progressive story. Each module answers a different buyer concern, and one selling point
is never repeated. Take the subset the product actually needs.

| Slot | Content |
|---|---|
| Brand or value hero | Credibility and category position |
| Problem and solution | The buyer's friction, then the product's answer |
| Core claim and evidence | The claim plus visual evidence, deeper than a carousel |
| Structure and detail | How the mechanism works and why it holds |
| Scene extension | The product in different settings, for different people |
| Size and compatibility | Dimensions, ranges, compatibility, load capacity |
| Installation, care, FAQ | Only when these are real buyer concerns |

Merge two modules that make the same point, or drop one. Do not pad with weak modules.

### Buyer decision logic, planned before rendering

1. Does it fit me? — size, capacity, compatibility.
2. Is it stable, safe, reliable? — structure, material, evidence.
3. What can I actually do with it? — versatility, modes.
4. Is it worth this space or this price? — durability, value, fit at home.
5. How do I use it? — installation, adjustment, care.

For each module write: concern (what the buyer hesitates over), claim (what they should believe
after seeing it), evidence (what in the picture makes it credible). Merge related claims; skip
concerns already answered or unsupported.

## 4. Apparel and footwear

The slot language above assumes hard goods. When the product is apparel, footwear, or a wearable
accessory, these rules take precedence:

- **Full-body model required** — every module that shows the garment presents it on a complete,
  head-to-toe, naturally posed model. Do not crop below the neck, do not float or flat-lay the
  garment as the only presentation, and do not use a headless mannequin. The one exception is the
  dedicated detail module, which is a row of three macro close-ups.
- **Garment consistency** — every prompt that shows the garment states: reproduce this exact
  garment from the reference — do not change color, pattern, cut, or style, do not redraw it, and
  keep it identical across every module. Pass the same reference image every time.
- **Module mapping**
  - Brand hero — the logo, one material or core-claim headline, a full-body model wearing the
    garment, and only the real logo.
  - Selling-point icons — one emotional headline plus a row of four to six clean icons with short
    labels: fabric, cut, occasion, care.
  - Detail close-ups — render three side-by-side macro cells, each a tight crop of a different
    construction detail (stitch, weave, neckline, waistband, hardware, lining), each with one
    short label. Do not try to embed three macro windows inside one hero; the model collapses them
    into text.
  - Scene grid — one headline plus three or four full-body model shots in genuinely different
    settings, each with a context label.
  - Sizes — one full-body lifestyle model plus a drawable size band, using the brand's real size
    steps; add height and weight ranges for slim fits and kidswear to reduce returns.
- **Minimum modules** — every apparel set includes a size module, which is the largest return-
  reduction lever. A set therefore has at least four modules: hero, at least one evidence module
  (detail close-ups and/or selling-point icons), occasion grid, and sizes.
- **Compliance** — use real fiber names (for example "bamboo viscose", not "bamboo fabric"); make
  no unverified performance, environmental, or safety claim; use only real size steps and never
  invent them. Without real size steps, ask the user; do not skip the module and do not fabricate.

## 5. Layout and copy

Every module that carries text has three layers. Write the actual copy before rendering:

1. **Headline** — two to five words, largest, a functional benefit.
2. **Subline** — one complete benefit sentence, medium weight.
3. **Note or support line** — one short reassurance or specification sentence, smallest.

Add callouts wherever a component is marked. A pure lifestyle or hero module may drop to two
layers; a size module uses the size band as its body copy.

Per-module layout decisions, not one template repeated:

- Headline only when the module introduces a new concept or a narrative turn; a scene that speaks
  for itself needs none. Use functional benefit language, not poster slogans, and every headline
  needs visual evidence.
- Detail modules use a row of three macro close-ups; other modules use two to four numbered
  badges beside the detail, varied across modules.
- Sizes appear only in the dedicated fit or specification module, as a size band, never inside a
  lifestyle scene.
- Comparison only when it is fair, concrete, and non-infringing; avoid generic "old way versus new
  way" framing.
- Depth: foreground hook (detail, number, badge), mid-ground product evidence, background context.
- Text density may exceed a carousel but stays around 25–30 percent of the visible area, with
  deliberate negative space.
- Editorial versus technical: brand, problem, and scene modules are editorial, warm and narrative;
  size and structure modules are technical, clean and diagrammatic; evidence claims mix the two.

Change the label system by module role: large accent claim, thin size line, colored compatibility
bar, circular detail bubble, icon-plus-text stack, no-copy lifestyle. A stack where every module
uses white background with small black labels reads as machine-made; reject it.

## 6. Lock the design system once

Write one small design system into the plan, then repeat the same tokens in every module prompt:

- canvas size, locked first and written into every prompt;
- layout per module, chosen during planning;
- three to five style keywords plus one lighting and atmosphere sentence;
- palette: primary, secondary, accent, background — the accent is used once per module;
- type system: one heavy sans for headlines, one regular sans for body, with each layer's color
  fixed across modules;
- visual language: the recurring decorative motif and icon style;
- quality: request enough resolution that headlines and labels stay readable.

### Never draw the specification into the picture

These values instruct the renderer; they are not image content. Color values, font names, section
titles, field labels such as "title", "subtitle", or "size table", structural notes, and prompt
fragments must never appear inside the image. Only viewer-facing copy — the actual headline,
subline, note, labels, and size numbers — appears.

The picture says `Soft breathable fabric`; it never says `Title: Soft breathable fabric`.

## 7. Reference handoff

1. The product base image — the user's photograph or an accepted generated base — is the only
   source of truth.
2. Every module derives from it: pass the image in `referenceImages`; never restate the product in
   words, and never rely on "the product from before".
3. Every module prompt states: keep the product's exact appearance — shape, proportions, material,
   color, marks, real printed text — unchanged; change only the scene, layout, callouts, and
   context. Do not redesign or restyle the product.
4. When the user supplies several angles or variants, use the most representative one as the main
   base and the others as supporting references. When the tool's reference limit is reached, state
   the limit and keep the first N in user-visible order, or ask; never drop silently.
5. Pure background or scene plates with no product may be text-generated, but the product itself
   always comes from the base image.
6. Apparel: the reference is usually a flat-lay or hanger shot — instruct the generation to dress a
   complete full-body model in this garment while keeping its color, pattern, cut, and proportions
   identical.

When the base image is not yet decided, stop and settle it first.

## 8. Storyboard before rendering any module

This step prevents the scene's largest failure: every module reusing nearly the same product shot.

1. List every distinct photograph the stack needs, each with a different setting, pose, framing,
   or crop. For apparel this usually means:
   - one hero lifestyle shot, full body, environment A;
   - three or four scene shots, each a genuinely different environment or activity, with different
     background, pose, and light — not one photo recolored;
   - at least three detail close-ups, each a tight macro crop of a different detail;
   - one size or fit full-body shot, which may differ from the hero.
2. Map each photograph to the module that uses it. Two modules on one photograph is a red flag:
   either differentiate it with a new scene, pose, or crop, or confirm the reuse is deliberate.
   The hero module and the size module never share one photograph.
3. Generate the distinct base photographs first, then assemble modules from them. Every generated
   photograph must differ visibly from the others — environment, camera position, pose, crop, light
   — while the product stays identical.
4. When a module needs several cells, such as a three- or four-cell scene grid, generate each cell
   as its own scene; never fill a grid with one repeated photograph.

Organize by semantic role — key visual, scene-sleep, detail-weave, size shot — one request per
role. Never split one request's returned images across modules by order.

Record the storyboard table before rendering: role name, scene or pose or crop, and the module that
uses it.

## 9. Flow

1. **Intake** — product base image; brand and product names if the hero needs them (without them,
   produce a brand-free version and never invent a name or logo); selling points and specifications;
   target market and copy language; tone, accent color, and method-only references; category and
   target buyer.
2. **Concern map and module plan** — list the buyer concerns, pick the slots the product needs, and
   write concern, claim, and evidence per module. Write the actual three-layer copy now, in the
   target language; a module without its copy does not render.
3. **Visual lock** — canvas size first, then layout, accent, and the design system.
4. **Storyboard** — list distinct photographs, de-duplicate against modules, and assign semantic
   roles.
5. **Base images then modules** — generate the distinct bases one role at a time from the product
   base, then assemble each module with its assigned base photograph, layout, and label treatment.
6. **Pre-delivery gates** — run the list below; a failing module is regenerated from the base image.

## 10. Pre-delivery gates

- **Uniform frame (hard gate)** — every module matches the locked size; verify per module; reject
  any deviation, including a small one. Wrong size means regenerate with the exact size in the
  prompt.
- **Product fidelity** — shape, proportions, material, color, marks, and real printed text match
  the base image; no redesign, restyle, or invention.
- **No invented brand or product name (hard gate)** — every brand name, product name, and logo on
  the image comes from the user, verbatim. Without it, the deliverable is the brand-free version.
- **Apparel full-body model** — every apparel module except the dedicated detail module shows a
  complete, naturally posed, head-to-toe model.
- **Apparel size module present** — a size module with real size steps exists, and the set has at
  least four modules.
- **Distinct concerns** — each module answers a different buyer question; no selling point repeats.
- **Photo diversity (hard gate)** — no two modules share one or a near-identical photograph. Each
  grid cell is a different environment; detail modules are tight macro crops, not another full
  shot; the hero and size modules differ.
- **Three or more detail close-ups, in a row (hard gate)** — the detail module is three side-by-side
  macro cells, each a different real detail, each with a selling-point label.
- **Layout decisions hold** — headlines appear only where they earn their place and have visual
  evidence; size bands appear only in fit or specification modules; comparisons stay fair and
  concrete.
- **Complete text hierarchy** — every text-bearing module carries headline, subline, and note,
   plus callouts, not a lone headline.
- **Drawable graphics** — size bands instead of dense tables, one clean row of icons instead of a
  tight grid, numbered badges instead of anchored leader lines.
- **No specification or metadata in the image** — zero color values, font names, section titles,
  field labels, or prompt text; only viewer-facing copy.
- **Label variety** — the label treatment changes by module role; the stack does not read as
   automatically generated.
- **Readable density** — visible copy stays around 25–30 percent, headlines and labels stay crisp,
   and the language is consistent across the stack.
- **Recognizable layouts** — every module is a recognizable standard layout, not an improvised
  banner.
- **Accent discipline** — the accent color marks a keyword, number, or element; it is not applied
  to every line of copy.
