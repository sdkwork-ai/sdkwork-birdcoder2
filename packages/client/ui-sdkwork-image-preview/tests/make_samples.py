"""Generate real image fixtures for the image-preview specs.

Pillow is the independent encoder here: the spec decodes what a real writer
produced, not bytes this repository also authored. Every TIFF compression Pillow
exposes is written, plus the modes that exercise different photometric paths.
"""

from pathlib import Path

from PIL import Image

OUT = Path(__file__).parent / "samples"
OUT.mkdir(parents=True, exist_ok=True)

# A deterministic 8x8 gradient whose pixel at (x, y) is (x*32, y*32, 128).
grid = Image.new("RGB", (8, 8))
for y in range(8):
    for x in range(8):
        grid.putpixel((x, y), (x * 32, y * 32, 128))

# Every compression Pillow writes for TIFF, so the decoder's four paths are each
# covered by a file a real encoder produced.
for name, compression in [
    ("plain-none", "raw"),
    ("plain-lzw", "tiff_lzw"),
    ("plain-packbits", "packbits"),
    ("plain-deflate", "tiff_deflate"),
    ("plain-adobe-deflate", "tiff_adobe_deflate"),
]:
    grid.save(OUT / f"{name}.tif", compression=compression)

# Photometric variants: grayscale, palette, and CMYK go down different paths.
grid.convert("L").save(OUT / "plain-gray.tif", compression="tiff_lzw")
grid.convert("P", palette=Image.ADAPTIVE).save(OUT / "plain-palette.tif", compression="tiff_lzw")
grid.convert("CMYK").save(OUT / "plain-cmyk.tif", compression="tiff_lzw")
grid.convert("RGBA").save(OUT / "plain-alpha.tif", compression="tiff_lzw")

# A 32x32 tile-based TIFF, which takes the tile path rather than the strip path.
tiled = Image.new("RGB", (32, 32))
for y in range(32):
    for x in range(32):
        tiled.putpixel((x, y), ((x * 8) % 256, (y * 8) % 256, 64))
tiled.save(OUT / "tiled-lzw.tif", compression="tiff_lzw", tiled=True, tile=(16, 16))

# Big-endian, which exercises the byte-order branch.
grid.save(OUT / "plain-bigendian.tif", compression="tiff_lzw", byteorder=">")

# A stated resolution, which Pillow omits unless asked for.
grid.save(OUT / "plain-dpi.tif", compression="tiff_lzw", dpi=(300, 300))

# A resolution whose denominator is not one: the tag is a rational, and reading
# only its numerator would report twice the real density.
grid.save(OUT / "plain-dpi-rational.tif", compression="tiff_lzw", dpi=(150.5, 150.5))

# A non-square image carrying an Orientation tag, the shape a scanner writes
# when it stores sideways strips and a rotation byte instead of rotating pixels.
# Orientation 6 turns the stored 4x8 frame a quarter clockwise into 8x4; the
# pixel at (x, y) is (x*64, y*32, 128) so a rotation is visible in the samples.
sideways = Image.new("RGB", (4, 8))
for y in range(8):
    for x in range(4):
        sideways.putpixel((x, y), (x * 64, y * 32, 128))
sideways.save(OUT / "sideways-orient6.tif", compression="tiff_lzw", tiffinfo={274: 6})

# The native path, for the formats the browser decodes itself.
grid.save(OUT / "plain.png")
grid.convert("RGBA").save(OUT / "plain-alpha.png")
grid.save(OUT / "plain.jpg", quality=90)
grid.save(OUT / "plain.bmp")
grid.save(OUT / "plain.gif")
grid.save(OUT / "plain.webp", lossless=True)

# A vector file, which is text rather than a raster signature.
(OUT / "plain.svg").write_text(
    '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="8" height="8">'
    '<rect width="8" height="8" fill="#204080"/></svg>',
    encoding="utf-8",
)

# Mislabelled files: the extension claims one format and the bytes are another,
# which is what the sniffer exists to catch.
(OUT / "mislabelled-png.png").write_bytes((OUT / "plain.jpg").read_bytes())

print("\n".join(sorted(f"{p.name} {p.stat().st_size}" for p in OUT.iterdir())))
