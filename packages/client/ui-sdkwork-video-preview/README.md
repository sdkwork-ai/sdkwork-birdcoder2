---
description: "Video previews in the right Sidebar: container and codec identification read from the bytes, a full transport bar, and an actionable explanation when the platform cannot decode a file."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-video-preview

English | [中文](README.zh.md)

## Summary

Draws video in the right Sidebar's document tab. The package claims the video container suffixes in the document registry — none of which anything claimed before, so a video used to be reported as "not text" — reads the container structure to learn what the file actually is, and contributes the keyed body that plays it with a full transport bar. When the platform refuses a file, the numeric media error is replaced with the container, the codec, and the conversion the reader needs.

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

- **Renderer metadata** — `ctx.documentPreviews.register(...)` with id `@deepseek-ai/dsh-client-ui-sdkwork-video-preview/video`, `loading: 'bytes-complete'`, and thirty-one suffixes. Leaving `priority` unset puts the registration in the `extension` band.
- **The body** — the keyed `sidebar.right.tab.document` seat under that same id, in the plugin-local tab-scoped transport store declared by the registration.
- **The suffixes nothing else wanted.** MP4, MOV, WebM, Matroska, Ogg, AVI, ASF/WMV, FLV, MPEG, transport streams, 3GPP, RealMedia, VOB, MXF, and DV are all claimed. The containers no browser decodes are claimed deliberately: unclaimed, they fall through to the plain-text reader and are reported as text, which is exactly the wrong explanation for a `.wmv`. Three families are left alone on purpose: `ts` and `mts` are TypeScript sources here (the transport stream is claimed as `m2ts` instead), `tsv` is tab-separated data, and `oga`/`mka` belong to the audio preview.

<a id="how-it-renders"></a>
## How it renders

Identification runs first, because a `<video>` element answers questions no reader asked. `video/containers.ts` reads the file's own structure:

| Container | What is read |
| :-- | :-- |
| ISO base media (MP4, MOV, M4V, 3GPP) | The box tree, the movie header's timescale and duration, each track's handler and sample-description codec, and the track dimensions |
| Matroska and WebM | The EBML tree: the segment's timecode scale and duration, each track entry's type, codec id, and picture size |
| MPEG transport stream | The program association table, then the program map table's stream types, so the track kind is not guessed from its name. Both framings are read: bare 188-byte packets and the M2TS/BDAV frames a camcorder writes, where every packet carries a four-byte arrival timestamp and the sync byte therefore sits 188 bytes from the end of the frame |
| Ogg | The codec identification header, and Theora's 24-bit picture size |
| RIFF AVI | Each stream's handler and handler codec, the video stream's `BITMAPINFOHEADER`, and the main header's frame interval and frame count — the picture size and the run time |
| ASF | The stream properties object's media type and the `BITMAPINFOHEADER` compression code, and the file properties object's play duration less its preroll |
| Flash Video | The first video tag's codec id |

That yields a container, a track list, a duration, and a picture size — enough to decide whether the platform is even worth asking, and enough to explain the file when it is not. **Identification is a hint, never a verdict**: a container the platform handles can still carry a codec it does not, so a file that passes identification is verified by actually loading it, and the element's refusal is reported with the container and codec this preview already read from the bytes.

**Every read is total.** Not one of those parsers may throw, because the body deliberately carries no defensive `catch` around identification — a malformed container has to become an explanation, not an exception that takes the panel down. Two properties make that structural rather than hopeful: every byte is read through a single guard that yields zero past the end of the file (an index past a `Uint8Array` is `undefined`, and `undefined` in a size field is `NaN`, which silently disables the bound meant to constrain it), and every walk is bounded — by a byte budget for the head-of-file scans, and by a counted element budget where a legitimate file keeps its metadata at the tail.

One Blob URL is created per byte identity and revoked with the effect that created it.

<a id="interaction"></a>
## Interaction

The transport bar carries play and pause, elapsed and total time, a seek slider, mute and a volume slider, a playback-speed cycler over the browser's own rates, and a loop toggle. A second row carries zoom out, zoom in, fit, and actual size — the same steps the office previews use — plus picture-in-picture and full screen.

**Fit is the stage's own measurement, not a zoom step.** It is computed from the measured stage and the picture's size, and the percentage beside the controls is the multiple actually applied to the element — so the label and the picture can never disagree. The zoom ceiling bounds only a multiple a reader asks for with the buttons; the fitted one is not clamped, which is what makes fit mean *fit* for a clip smaller than the stage.

**The picture's size comes from the container, and from the element when the container declares none.** A transport stream keeps its dimensions inside the elementary stream rather than in a table this preview parses, so a file like that is measured by the element once it has metadata. That is not a nicety: with no size at all a zoom has nothing to apply a multiple to, and the percentage in the bar moves while the picture stays at exactly the size the stylesheet gave it.

Keyboard control is available whenever the viewer holds a focusable element: `Space` or `K` plays and pauses, `←`/`→` seek, `↑`/`↓` change the volume, `M` mutes, `L` toggles looping, and `F` toggles full screen.

Playback rate, volume, mute, loop, the zoom, and the playhead live in the tab store, so returning to a tab restores both the settings and the position. Below the bar is a metadata list: container, codec, picture size, duration, and the track summary.

**A file that cannot be played loses its controls and keeps its facts.** A container no browser opens, or one the element refuses, has no element to drive — so the bar is not rendered at all rather than left inert, and the stage stops being a focusable keyboard transport. What stays is the metadata list, which is the one part of the panel that is not an affordance: for a file the reader is about to convert, the container, the codec, the picture size, and the length are exactly what they need. That is a deliberate difference from the image preview, whose failure state has no facts to give — nothing about a video can be learned by rendering it, and everything here was read from its own bytes.

<a id="model-experience"></a>
## Model Experience

None, as the preview is a browser-only viewer that registers no tool, prompt section, or session event.

#### KV Cache effect

No direct effect; what the user reads here never enters a model request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>
- **Containers no browser decodes are explained, not played.** AVI, ASF/WMV, FLV, MPEG-1/2, RealMedia, and MPEG elementary streams each name the container, the codec read from the bytes, and the conversion needed. This is a platform limit, not a gap in this package: no browser plays them.
- **What a refused container declares about itself is reported, and what it does not stays unknown.** AVI and ASF state their picture size and run time in their own headers, so a blocked `.avi` or `.wmv` still shows both — which matters most in exactly that state, since the file cannot be played to learn them. FLV, MPEG-1/2, RealMedia, MXF, and DV state neither in a table this preview reads, and a transport stream keeps both inside its elementary stream: those cells read "unknown" until an element that can decode the file reports them, and stay unknown when nothing can.
- **The declared run time is shown to the nearest second, and the element's to the second it is on.** A container's own run time is a frame count times an interval it stores in whole microseconds — a one-second AVI declares 0.99999 — so it is rounded; the duration the seek bar divides by is a decoder's measurement and is truncated with the playhead.
- **Codec-level refusal is common inside playable containers.** An MP4 holding MPEG-4 Visual or ProRes is identified as unplayable before the element is asked; an MP4 holding HEVC or AV1 is attempted and may still be refused on a platform where the codec is not enabled, in which case the explanation names both.
- **Codec support is the platform's, not this package's.** The same file plays in one browser and not another; the preview reports what happened rather than pretending to normalize it.
- **No subtitles, chapters, or multiple audio-track selection.** The caption reports how many audio tracks the file carries, but the track cannot be chosen, and embedded subtitle tracks are not rendered.
- **No transcoding.** Nothing is re-encoded, so an unplayable file stays unplayable until the reader converts it.
- **The byte ceiling is the document owner's, not this package's.** The preview asks for the whole file, so what it can open is bounded by `workspace-files`' `maxFileBytes` (32 MiB by default). A larger video is refused before identification ever runs.
- **Identification reads only the head of the file.** Signatures, stream handlers, program maps, and Matroska metadata all live there, and the scan is capped at 4 MiB. The ISO-BMFF walk is the one exception, because a non-faststart MP4 keeps its `moov` at the tail — so fragmented MP4 whose initialization data appears only in later fragments, and MXF or DV files, are identified by suffix alone.
- **The fixtures are ffmpeg output.** The spec identifies files ffmpeg muxed, so the containers and codecs are real, but no file from a camera, a screen recorder, or a streaming service is in the corpus.
- **Picture-in-picture and full screen are the platform's.** Both are offered, and both are refused where the browser does not implement them; the control then does nothing rather than reporting a failure, which is what the platform leaves to report.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

`video/containers.ts` owns identification and is the only place a container or codec is named; it has no DOM dependency and is covered by a Node-environment spec. `VideoPlayer.tsx` owns the element, the transport bar, and the single Blob URL. `tests/make_samples.py` regenerates the fixtures with ffmpeg — run it after changing a parser so the specs keep identifying real muxer output. The transport stream fixture is a real M2TS (192-byte frames); the spec also derives a bare 188-byte stream from it, so both framings stay pinned. It is named `.m2ts` and not `.ts` because a `.ts` extension collides with TypeScript in this repository and the linter tries to parse the binary.

**Byte order is per-format, and getting it wrong is silent.** ISO-BMFF, Matroska, transport-stream and FLV fields are big-endian; **RIFF and ASF are little-endian**. A RIFF chunk size read big-endian is a number in the billions, so the walk clamps it to the end of the file and steps over every stream header inside the chunk — an AVI then reports no streams at all, and a codec of "unknown", for a file whose `strh` names the codec four bytes in. The spec's own fixture writer mirrors *the format*, not the parser: `u32` for big-endian, `u32le` for little-endian, and the corpus case that reads a real ffmpeg AVI is what pins the order.

**The two little-endian containers state their facts relative to an anchor, and both anchors are producer-proof.** A RIFF video stream's `strf` chunk *is* the `BITMAPINFOHEADER`, so its width and height are read at fixed offsets from the chunk start. An ASF video media type *embeds* that header in a `VIDEOINFOHEADER`, and producers pad it differently — ffmpeg writes eleven bytes of its own before it — so the width and height are read twelve and eight bytes before the `biCompression` four-character code, which is the one offset their padding cannot move. Two arithmetic details cost real accuracy and are pinned by the spec rather than trusted: the `biHeight` of a top-down bitmap is **negative**, and ASF's play duration **includes the preroll the encoder declared**, so ffmpeg's 4.1 seconds of duration and 3.1 seconds of preroll describe a one-second clip. That subtraction happens in the header's own 100-nanosecond units, before the division, because `4.1 - 3.1` is `0.9999999999999998` and would floor to `0:00`.

A container's identifier is echoed as **printable ASCII only**. A Matroska `CodecID` is free text, so it reaches the panel as whatever the file wrote; a control character or a bidirectional override draws something other than what the file said, and a right-to-left override beside the container name is a spoof rather than a curiosity.

Two contracts the spec enforces directly, because both can only fail in ways a reader would see: every suffix in `VIDEO_EXTENSIONS` must be one `inspectVideo` can actually identify (a claim the identifier cannot answer routes a file to a body that says "this is not a readable video"), and no byte sequence may make identification throw. The second is checked against deliberately damaged input, including files truncated mid-element, box lengths that reach past the end, and program tables whose pointer fields point beyond the buffer.

</details>

**Runtime invariant:** No companion is published. Playback is delegated to the platform and container parsing is covered by behaviour tests against real muxer output; there is no second independent observation of the same relationship to compare against.
