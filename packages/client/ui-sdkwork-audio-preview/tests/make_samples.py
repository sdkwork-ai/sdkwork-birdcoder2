"""Generate real audio fixtures for the audio-preview specs.

ffmpeg is the independent encoder here: the spec reads what a real muxer wrote,
not bytes this repository also authored. Every container the preview recognizes
is written, each one carries the same tags so the tag readers can be compared
against each other, and three fixtures carry what a suffix cannot tell you — a
cover picture, a title written in Chinese, and a file with no tags at all.
"""

import subprocess
from pathlib import Path

OUT = Path(__file__).parent / "samples"
OUT.mkdir(parents=True, exist_ok=True)

SINE = "sine=frequency=440:sample_rate=44100:duration=1"
# A one-second silent source, for the muxes that attach artwork to a stream
# instead of carrying one: an unbounded source would write forever.
SILENCE = "anullsrc=channel_layout=mono:sample_rate=44100:duration=1"
TAGS = [
    "-metadata", "title=Test Tone",
    "-metadata", "artist=Preview Spec",
    "-metadata", "album=Fixtures",
    "-metadata", "date=2024",
    "-metadata", "track=3",
]
# A title in a language whose bytes are not ASCII: whatever encoding the muxer
# chooses to write is what the reader has to decode.
CJK_TAGS = [
    "-metadata", "title=夜色温柔",
    "-metadata", "artist=测试",
    "-metadata", "album=样本",
    "-metadata", "date=2024",
    "-metadata", "track=3",
]

# Container, codec, and the extra arguments that codec needs.
CASES = [
    ("plain-mp3.mp3", ["-c:a", "libmp3lame", "-b:a", "128k"]),
    ("plain-vbr.mp3", ["-c:a", "libmp3lame", "-q:a", "4"]),
    ("plain-aac.m4a", ["-c:a", "aac", "-b:a", "128k"]),
    ("plain-alac.m4a", ["-c:a", "alac"]),
    ("plain.wav", ["-c:a", "pcm_s16le"]),
    ("plain.flac", ["-c:a", "flac"]),
    ("plain-vorbis.ogg", ["-c:a", "libvorbis"]),
    ("plain-opus.ogg", ["-c:a", "libopus", "-b:a", "96k"]),
    ("plain-opus.webm", ["-c:a", "libopus", "-b:a", "96k"]),
    ("plain-wma.wma", ["-c:a", "wmav2"]),
    ("plain-aiff.aiff", ["-c:a", "pcm_s16be"]),
    ("plain-mp2.mp2", ["-c:a", "mp2"]),
    ("plain-ac3.ac3", ["-c:a", "ac3"]),
    ("plain-amr.amr", ["-c:a", "libopencore_amrnb", "-ar", "8000", "-ac", "1", "-b:a", "12.2k"]),
    # Containers this preview names but no browser decodes.
    ("plain-eac3.eac3", ["-c:a", "eac3", "-f", "eac3"]),
    ("plain-caf.caf", ["-c:a", "pcm_s16le", "-f", "caf"]),
    ("plain-au.au", ["-c:a", "pcm_s16be", "-f", "au"]),
    ("plain-voc.voc", ["-c:a", "pcm_u8", "-f", "voc"]),
    ("plain-wavpack.wv", ["-c:a", "wavpack", "-f", "wv"]),
    ("plain-tta.tta", ["-c:a", "tta", "-f", "tta"]),
    # The DTS encoder is experimental, which is what `-strict -2` unlocks.
    ("plain-dts.dts", ["-c:a", "dca", "-strict", "-2", "-f", "dts"]),
]

for name, codec in CASES:
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", SINE, *codec, *TAGS, str(OUT / name)],
        check=True,
    )

# A title that is not ASCII, so the tag decoder is exercised on real muxer output.
subprocess.run(
    [
        "ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", SINE,
        "-c:a", "libmp3lame", "-b:a", "128k", *CJK_TAGS, str(OUT / "plain-cjk.mp3"),
    ],
    check=True,
)

# The commonest file in the world: no tags at all. The stage has to fall back to
# the file's own name rather than to a placeholder, which needs a fixture with
# nothing to fall back from.
subprocess.run(
    [
        "ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", SINE,
        "-c:a", "libmp3lame", "-b:a", "128k", str(OUT / "plain-untagged.mp3"),
    ],
    check=True,
)

# An attached picture, which is what a cover-art reader has to find.
cover = OUT / "cover.png"
subprocess.run(
    ["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", f"color=c=#1b3a6b:s=300x300:d=1", "-frames:v", "1", str(cover)],
    check=True,
)
subprocess.run(
    [
        "ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", SILENCE, "-i", str(cover),
        "-map", "0:a", "-map", "1:v", "-c:a", "libmp3lame", "-b:a", "128k", "-c:v", "copy",
        "-disposition:v", "attached_pic", *TAGS, str(OUT / "plain-cover.mp3"),
    ],
    check=True,
)
# The same artwork reaches an MP4 as a `covr` atom instead of an ID3 frame.
subprocess.run(
    [
        "ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", SILENCE, "-i", str(cover),
        "-map", "0:a", "-map", "1:v", "-c:a", "aac", "-b:a", "128k", "-c:v", "copy",
        "-disposition:v", "attached_pic", *TAGS, str(OUT / "plain-cover.m4a"),
    ],
    check=True,
)
cover.unlink()

print("\n".join(sorted(f"{path.name} {path.stat().st_size}" for path in OUT.iterdir())))
