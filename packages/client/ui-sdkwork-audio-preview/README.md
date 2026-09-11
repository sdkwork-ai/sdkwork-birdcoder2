---
description: "Audio previews in the right Sidebar: container, codec, tag and cover-art reading from the bytes, a decoded waveform as the seek surface, a transport bar, and an actionable explanation when the platform cannot decode a file."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-audio-preview

English | [中文](README.zh.md)

## Summary

Draws audio in the right Sidebar's document tab. The package claims the audio container suffixes, reads the container, codec, tags, and cover art from the file itself, and contributes the keyed body that plays it with a transport bar over a waveform decoded from the bytes. Sound has no picture, so what the reader gets is everything the file says about itself — the cover art, the tags, and the shape of the sound. A file the platform refuses is explained with the container and codec this preview already read from the bytes, instead of a numeric media error.

## Table of Contents

- [What it registers](#what-it-registers)
- [How it renders](#how-it-renders)
- [Interaction](#interaction)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="what-it-registers"></a>
## What it registers

- **Renderer metadata** — `ctx.documentPreviews.register(...)` with id `@deepseek-ai/dsh-client-ui-sdkwork-audio-preview/audio`, `loading: 'bytes-complete'`, and forty-six suffixes. Leaving `priority` unset puts the registration in the `extension` band.
- **The body** — the keyed `sidebar.right.tab.document` seat under that same id, in the plugin-local tab-scoped transport store declared by the registration.
- **Containers no browser decodes** — WMA/ASF, AMR, Monkey's Audio, WavPack, True Audio, Speex, MIDI, DSD, DTS, CAF, Sun/NeXT audio, Creative Voice, and GSM are claimed so the body can name them and the conversion each needs, rather than letting them fall through to the plain-text reader.

<a id="how-it-renders"></a>
## How it renders

`audio/containers.ts` reads what the file carries, because a media element reports only a number:

| What is read | Where it comes from |
| :-- | :-- |
| Container and codec | The signature, then the structure: an ISO sample description distinguishes AAC from ALAC inside the same `.m4a`, and the suffix separates AC-3 from E-AC-3, which open with one sync word |
| Tags | ID3v2.3 and v2.4 frames — each decoded in the encoding its own frame declares — with an ID3v1 trailer fallback, Vorbis comments in FLAC and Ogg, WAVE's RIFF `INFO` and `id3 ` chunks, FLAC picture blocks, and the MP4 `ilst` atoms |
| Cover art | An ID3 attached-picture frame, a FLAC picture block, or an MP4 `covr` atom, typed by its own magic number rather than by what the container claimed, and turned into one Blob URL |
| Geometry and duration | FLAC's stream information, WAVE's data chunk against its byte rate, AIFF's common chunk, the ISO movie header, and the frame header an MP3 or MP2 opens its stream with — each read from the structure rather than assumed adjacent |
| The sound itself | `audio/waveform.ts` decodes the file through the Web Audio API and reduces it to peaks: the overview a listener actually navigates by, which a slider alone cannot give |

Identification is a hint, never a verdict: a container the platform handles can still carry a codec it does not, so a file that passes is verified by loading it, and a refusal is reported with the container and codec already read from the bytes. Both Blob URLs are created with the effect that made them and revoked with it.

<a id="interaction"></a>
## Interaction

The stage shows the cover art when the file has any, then the title — the one a producer wrote, else the file's own name, which is the name the tab chip carries — then the artist, album and year line, a one-line summary of codec, sample rate and channel layout, and the waveform. The waveform is two layers: a canvas that draws the sound, and a real range input across it, transparent but focusable, so pointer seeking, arrow-key stepping, and the slider role a screen reader announces are the platform's own rather than a re-implementation.

The transport bar carries play and pause, the elapsed and total time, the ten-second jumps, mute with a volume slider, a playback-speed cycler, and a loop toggle. The stage itself takes the keyboard, as the video preview's does: space or `k` plays and pauses, the left and right arrows move the playhead by ten seconds, the up and down arrows move the volume, `m` mutes, and `l` loops. While a file plays, the system's own media controls are offered the title, artist, album and artwork, and its media keys drive the same transport. Playback rate, volume, mute, loop and the playhead live in the tab store, so returning to a tab restores both the settings and the position, while closing one discards them.

A file the platform will not decode keeps the bar, with the transport disabled, but gives the stage to a single explanation card: the container and codec it read, what to convert the file to, and — when the element itself refused rather than identification — the media error behind the refusal. No waveform, cover art or title is drawn for a file nothing can play. Below it is the metadata list of container, codec, sample rate, channels, duration, track, genre, and whether cover art is present.

<a id="model-experience"></a>
## Model Experience

None, as the preview is a browser-only viewer that registers no tool, prompt section, or session event.

#### KV Cache effect

No direct effect; what the user hears here never enters a model request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>
- **The waveform needs a second decoder.** Peaks come from the Web Audio API, which may refuse a file the element happily plays. A reader then loses the picture of the sound, never the player: absent peaks are never fatal, and nothing else on the stage depends on them.
- **Containers no browser decodes are explained, not played.** WMA/ASF, AMR, Monkey's Audio, WavPack, True Audio, Speex, MIDI, DSD, DTS, CAF, Sun/NeXT audio, Creative Voice, and GSM each name the container, the codec, and the conversion needed. This is a platform limit, not a gap in this package.
- **Geometry the container does not state is left to the element.** An MP4 sample entry writes zeros where the real values live in a codec-private descriptor, so nothing is claimed rather than something wrong. The decoder is not asked either: `decodeAudioData` reports the audio context's sample rate, not the file's, so taking a rate from it would name one the file does not have.
- **MP3 duration is left to the element.** Reading it from the container needs the Xing/Info frame header; the element reports the true duration once metadata loads, so this only affects the explanatory path.
- **No tags from APE tag blocks or ASF content-description objects.**
- **The spec corpus is one encoder's output.** Identification, tags, geometry, duration, waveform reduction, and the player are covered by four specs over twenty-five ffmpeg-produced fixtures — twelve containers, two cover-art carriers, one Chinese title, one untagged file — but no file from a ripper, a streaming service, or a DAW is in it.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

`audio/containers.ts` owns identification, tags, and geometry and is the only place a container or codec is named; it has no DOM dependency. `audio/waveform.ts` owns the Web Audio decode and the canvas painting, and degrades to no picture wherever the API is missing or refuses. `AudioPlayer.tsx` owns the element, the transport bar, and both Blob URLs. `tests/make_samples.py` regenerates the fixtures with ffmpeg.

</details>

**Runtime invariant:** No companion is published. Decoding is delegated to the platform and container parsing is covered by behaviour tests against real encoder output; there is no second independent observation of the same relationship to compare against.
