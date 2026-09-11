---
name: birdcoder-music
description: Use when the user asks to generate music or a soundtrack — clarifies genre, mood, tempo, and length, drives the available music generation tool, and delivers the track with its generation parameters.
---

# Music Generation

Turn a mood or brief into a generated music track.

## Workflow

1. Fix the musical brief: genre/style, mood, tempo (BPM range), instrumentation hints, and duration (loop or full).
2. Note the use case (background for a video, standalone track) — background music wants fewer melodic hooks and a stable level.
3. Call the session's available music generation tool with that brief; state the parameters you chose.
4. Review against the brief; iterate one dimension per retry (mood, tempo, instrumentation).
5. Deliver the track with its parameters and a suggested usage note (fade in/out points when it backs a video).

## Rules

- One style per track; hybrid genres need the dominant one named first.
- If the request names a reference artist or track, capture the style in descriptive words, never by name.
