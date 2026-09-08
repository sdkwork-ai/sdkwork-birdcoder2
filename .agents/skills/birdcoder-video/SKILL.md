---
name: birdcoder-video
description: Use when the user asks to generate a video clip from a description — crafts a concrete video-generation prompt (subject, action, camera, style, duration), calls the available video generation tool, and iterates on the result.
---

# Video Generation

Turn a description into a generated video clip.

## Workflow

1. Restate the request as a generation brief: subject, action, setting, camera (angle/movement), style, and duration.
2. Craft one concrete prompt — visual language only, one scene per prompt; abstract wishes become visible details.
3. Call the session's available video generation tool with that prompt; state the parameters you chose (ratio, duration, style).
4. Review the result against the brief and iterate: change one variable per retry and say which.
5. Deliver the clip and the final prompt, so the user can reproduce or vary it.

## Rules

- Never chain two scenes into one prompt; generate separately and cut.
- Report tool failures verbatim and offer the adjusted prompt instead of silently retrying forever.
