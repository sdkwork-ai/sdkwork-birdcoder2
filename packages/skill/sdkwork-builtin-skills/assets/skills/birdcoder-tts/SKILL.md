---
name: birdcoder-tts
description: Use when the user asks for speech synthesis or text-to-speech — turns written copy into a speakable script (pacing, pauses, pronunciation), drives the available TTS tool with a matching voice, and delivers the audio.
---

# Speech Synthesis (TTS)

Turn written copy into natural spoken audio.

## Workflow

1. Prepare the script: expand symbols and numbers into speakable forms, break long sentences at breath points, and mark pauses and emphasis.
2. Pick the voice to match the content (gender/tone/speed per the request or the copy's register) and state the choice.
3. Call the session's available TTS tool with the script and voice settings (speed, pitch, pauses).
4. Check the output for misreadings — re-mark pronunciation for any term the engine got wrong and regenerate that part.
5. Deliver the audio with the script and voice settings, so the user can tweak and re-synthesize.

## Rules

- The script that is spoken must be shown to the user before or with the audio.
- Long copy is synthesized per paragraph, then assembled — one failure does not force a full redo.
