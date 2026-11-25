# Series Consistency And Anchor Chains

How a set of images is produced so it reads as one set. Several scenes share this page: a series of
posters, an IP or mascot set, product scene variants, and an e-commerce module stack. A scene
reference does not repeat these rules; it only adds its own gates.

## 1. When the deliverable is a set

Treat the following as one set, never as independent images:

- one subject identity appearing repeatedly — a character, mascot, product, or person;
- one style or theme across several deliverables — a social series, a matched material set, a
  module stack;
- several assets under one design system — a campaign or a brand-adjacent package.

The failure is expensive: parallel text-to-image requests each drift, and the whole set is rework.

## 2. The anchor chain

1. Produce one anchor and get it accepted — a text-to-image piece, or a reference image the user
   already supplied.
2. Do not fan out before the anchor is accepted. An unconfirmed anchor means every derived piece
   is provisional.
3. Generate every remaining piece from the anchor: pass the anchor URL in `referenceImages` and
   state in the prompt which identity and style traits must survive.
4. When a later piece starts drifting, pass the anchor together with the already accepted pieces
   as multiple references, which tightens the lock.

This is a serial chain with a real dependency: each derived request needs the anchor's returned
URL, so nothing is dispatched until the anchor generation settles.

## 3. What the anchor is per scene

| Scene | Anchor |
|---|---|
| Brand-adjacent package | The accepted logo, or the user's existing logo |
| Logo-derived displays | The accepted logo lockup |
| Mascot or character | The accepted front view, neutral and full body |
| IP material extension | The accepted three-view sheet, or the user's character sheet |
| E-commerce module stack | The user's product photograph, plus each storyboarded base image |

When no anchor exists yet, stop and lock one before deriving anything.

## 4. What consistency rests on

Consistency rests on reference images, not on prose. A text description cannot carry identity
detail. Do all three at once:

1. **Pass the anchor as a reference image.** "The previous one" or "that style" written into the
   prompt is not a reference.
2. **Freeze the description and reuse it verbatim.** Turn the subject description and style
   tokens into one block of text and paste that block into every derived prompt; change only
   action, scene, or crop.
3. **State what is preserved and what changes.** Every derived prompt names its invariants. "Keep
   it consistent" constrains nothing; list the traits.

### Invariants to list, by subject type

- **Character or mascot** — proportions, signature features (ear shape, pattern, accessories),
  palette, style, expression baseline.
- **Product or apparel** — shape, proportions, material, color, marks, and the real text printed
  on the product.
- **Logo or mark** — shape, proportions, color, structure, stroke weight, clear space.
- **Style series** — medium and texture, palette, light, composition logic, detail density.

## 5. Organize by semantic role, not by order

- Give each piece a semantic role name: key visual, side view, detail-weave, dark variant.
- One generation request per role.
- When one request returns several images, they are candidates for that one role. Never assign
  them to different roles by return order.
- Cite roles downstream; resolve them to URLs only when the request is made.

## 6. Carrying the anchor across turns

- After the user accepts an anchor, keep the artifact URL and the style description together.
- On a later turn, verify the anchor URL still resolves before deriving from it. Do not restate
  the old style from memory.
- When the user asks for a different style, retire the old anchor and create a new one. Distinguish
  "a different style" from "an adjustment within this style".

## 7. Gates before delivery

- **The anchor was used as a reference image** — the derived pieces are reference-driven, not
  text-rebuilt.
- **Exactly one anchor** — the base did not change mid-set.
- **Every invariant matches** — check proportions, features, palette, and style per piece.
- **No near-duplicates** — two pieces that differ only in their text or label are a duplicate; redo
  one with a different scene, pose, or crop.
- **The differences are real** — each cell of a scene grid is a different environment, and a detail
  close-up is a tight crop of a different detail, not another full shot.

A scene reference with stricter gates — the e-commerce photo-diversity gate, for example — takes
precedence over this page.
