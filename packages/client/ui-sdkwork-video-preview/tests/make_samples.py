RUN = """Generate real video fixtures for the video-preview specs.

ffmpeg is the independent encoder here: the spec identifies what a real muxer
wrote, not bytes this repository also authored. Every container the preview
recognizes is written, and each one is deliberately video-only — a file with no
audio track is what makes the "no audio tracks" clause of the track summary
checkable against real output rather than against a hand-built box tree.

The picture is tiny and one second long because these are read by a parser, not
watched: identification walks a real box tree, a real EBML tree, a real program
map table, and a real stream-properties object, and none of that needs
resolution to be real. `plain-h263.3gp` is the one exception: ffmpeg's H.263
encoder accepts only the ITU-T picture sizes, so it is QCIF and not 64x48.

Transport streams come in two framings and the fixture carries the one its own
suffix names: `plain-h264.m2ts` is M2TS/BDAV, where each 188-byte packet is
prefixed with a four-byte arrival timestamp, which is what a camcorder or a
Blu-ray rip writes. The spec derives the bare 188-byte framing from it by
dropping that prefix, so a preview that reads the program map of only one
framing is caught rather than shipped. The bare framing is not checked in as a
file of its own because its natural extension is `.ts`, and a `.ts` file in this
repository is TypeScript: the linter and the document registry both try to read
it as source.

Run from anywhere:

    python packages/client/ui-sdkwork-video-preview/tests/make_samples.py
"""

import subprocess
from pathlib import Path

OUT = Path(__file__).parent / "samples"
OUT.mkdir(parents=True, exist_ok=True)

# QuickTime and MPEG-4 Visual both need a real frame size; the encoders reject
# a picture smaller than a macroblock pair in one of the dimensions on some
# builds, and 64x48 is the smallest size every codec below accepts.
SMALL = "64x48"
RATE = "15"
SECONDS = "1"


def source(size: str) -> list[str]:
    """The synthetic picture every fixture is encoded from."""
    return ["-f", "lavfi", "-i", f"testsrc=size={size}:rate={RATE}:duration={SECONDS}"]


# File name, picture size, and the encoder arguments. `-an` on every row: the
# preview's track summary counts audio tracks, and a video-only corpus is what
# pins its zero case.
CASES = [
    # Containers a browser plays, so identification must let them through.
    ("plain-h264.mp4", SMALL, ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-f", "mp4"]),
    ("plain-h264.m4v", SMALL, ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-brand", "M4V ", "-f", "mp4"]),
    ("plain-h264.mov", SMALL, ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-f", "mov"]),
    ("plain-h264.mkv", SMALL, ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-f", "matroska"]),
    ("plain-vp9.webm", SMALL, ["-c:v", "libvpx-vp9", "-pix_fmt", "yuv420p", "-f", "webm"]),
    # The one transport-stream fixture, and a real M2TS: m2ts mode frames each
    # packet with the four-byte arrival timestamp the extension implies. The
    # program map decides the track kind, so a wrong extension or framing would
    # hide the table this spec reads.
    ("plain-h264.m2ts", SMALL, ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-mpegts_m2ts_mode", "1", "-f", "mpegts"]),
    ("plain-theora.ogv", SMALL, ["-c:v", "libtheora", "-pix_fmt", "yuv420p", "-f", "ogg"]),
    # ITU-T picture sizes only: the H.263 encoder rejects 64x48.
    ("plain-h263.3gp", "176x144", ["-c:v", "h263", "-f", "3gp"]),
    # Containers no browser decodes: identified, then explained.
    ("plain-mpeg4.avi", SMALL, ["-c:v", "mpeg4", "-f", "avi"]),
    ("plain-wmv2.wmv", SMALL, ["-c:v", "wmv2", "-f", "asf"]),
    ("plain-flv1.flv", SMALL, ["-c:v", "flv", "-f", "flv"]),
    ("plain-mpeg2.mpg", SMALL, ["-c:v", "mpeg2video", "-f", "mpeg"]),
    # Playable containers whose codec is refused: the codec-level explanation.
    ("plain-mpeg4.mov", SMALL, ["-c:v", "mpeg4", "-f", "mov"]),
    # Profile 0 is ProRes 422 Proxy, which is what the explanation names.
    ("plain-prores.mov", SMALL, ["-c:v", "prores_ks", "-profile:v", "0", "-f", "mov"]),
]

for name, size, codec in CASES:
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", *source(size), *codec, "-an", str(OUT / name)],
        check=True,
    )

print("\n".join(sorted(f"{path.name} {path.stat().st_size}" for path in OUT.iterdir())))
