---
name: birdcoder-image
description: Use when the user asks to generate an image or illustration — crafts a concrete image prompt (subject, composition, style, lighting, ratio), calls the available image generation tool, and iterates on the result.
---

# Image Generation

Turn a description into a generated image.

## Workflow

1. Restate the request as a visual brief: subject, composition, style (photographic/illustration/flat), lighting, mood, and aspect ratio.
2. Craft one concrete prompt — concrete nouns and visible qualities beat abstract adjectives.
3. Call the session's available image generation tool; state the chosen parameters (size, ratio, style).
4. Review against the brief; iterate one variable at a time (composition, then style, then detail).
5. Deliver the image(s) and the final prompt.

## Rules

- Generate the exact count requested; offer one variation only when the first result misses the brief.
- Text inside images is unreliable — suggest adding text in layout instead, unless the tool advertises typography support.
