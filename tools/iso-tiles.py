#!/usr/bin/env python3
"""Angle the Evolvlings top-down tiles into isometric tiles (placeholder art until we pick an isometric pack).

  python3 tools/iso-tiles.py ../path/to/Evolvlings

Needs Pillow. It cuts 32 x 32 px squares (2 x 2 tiles) of grass, dirt and water out of the Evolvlings map pictures
(art/maps/vado.png and home.png, which are the CC0 Ninja Adventure tiles drawn at 3x), rotates each square 45 degrees
and squashes it to a 64 x 32 diamond. Side faces for raised tiles are the dirt texture sheared along the diamond edges.
It also copies the creature sheets the test units use and the pack's tree, and keys the rock out of its grass.

Writes public/art/iso/top-<terrain>.png (64 x 32), side-left.png and side-right.png (32 x 32, one level = 16 px of
height), obj-rock.png and obj-tree.png, plus public/art/creatures/<id>.png."""
import os, shutil, sys
from PIL import Image, ImageDraw, ImageEnhance

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
OUT = os.path.join(ROOT, "public", "art", "iso")
TW, TH, LEVEL = 64, 32, 16
CREATURES = ["lumo", "chisporro", "canin", "ajolin"]


def one_x(path):
    """The Evolvlings maps are 16 px tiles at 3x; back to 1x so every source pixel is one pixel."""
    im = Image.open(path).convert("RGBA")
    return im.resize((im.width // 3, im.height // 3), Image.NEAREST)


def tiled(src, box, size=32):
    """Fills a size x size square by repeating a small crop (for water, whose clean area is small)."""
    piece = src.crop(box)
    out = Image.new("RGBA", (size, size))
    for y in range(0, size, piece.height):
        for x in range(0, size, piece.width):
            out.paste(piece, (x, y))
    return out


def diamond_mask():
    m = Image.new("L", (TW, TH), 0)
    ImageDraw.Draw(m).polygon([(TW // 2, 0), (TW - 1, TH // 2), (TW // 2, TH - 1), (0, TH // 2)], fill=255)
    return m


def to_diamond(square):
    """32 x 32 top-down square -> 64 x 32 isometric top: rotate 45 degrees, then halve the height."""
    big = square.resize((square.width * 4, square.height * 4), Image.NEAREST)
    rot = big.rotate(45, resample=Image.NEAREST, expand=True)
    top = rot.resize((TW, TH), Image.NEAREST)
    out = Image.new("RGBA", (TW, TH))
    out.paste(top, (0, 0), diamond_mask())
    return out


def side(texture, left, shade):
    """One level of side wall under a diamond edge: 32 px wide, 16 px tall, sheared to follow the edge."""
    tex = ImageEnhance.Brightness(texture.crop((0, 0, 32, LEVEL))).enhance(shade)
    out = Image.new("RGBA", (32, LEVEL + 16))
    for x in range(32):
        dy = x // 2 if left else (31 - x) // 2
        out.paste(tex.crop((x, 0, x + 1, LEVEL)), (x, dy))
    return out


def key_out(im, bg, tol=40):
    """Makes pixels close to the background colour transparent (to lift the rock off its grass)."""
    im = im.copy(); px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if abs(r - bg[0]) + abs(g - bg[1]) + abs(b - bg[2]) < tol:
                px[x, y] = (0, 0, 0, 0)
    return im


def main(evo):
    os.makedirs(OUT, exist_ok=True)
    vado, home = one_x(os.path.join(evo, "art/maps/vado.png")), one_x(os.path.join(evo, "art/maps/home.png"))
    grass = home.crop((168, 112, 200, 144))
    dirt = vado.crop((106, 90, 138, 122))
    water = tiled(home, (108, 30, 116, 38))
    tops = {"grass": grass, "dirt": dirt, "water": water, "rock": grass, "tree": grass}
    for name, sq in tops.items():
        to_diamond(sq).save(os.path.join(OUT, f"top-{name}.png"))
    side(dirt, True, 0.78).save(os.path.join(OUT, "side-left.png"))
    side(dirt, False, 0.6).save(os.path.join(OUT, "side-right.png"))
    rock = home.crop((95, 79, 113, 97))
    key_out(rock, grass.getpixel((2, 2))).save(os.path.join(OUT, "obj-rock.png"))
    shutil.copy(os.path.join(evo, "art/objects/tree.png"), os.path.join(OUT, "obj-tree.png"))
    cdir = os.path.join(ROOT, "public", "art", "creatures"); os.makedirs(cdir, exist_ok=True)
    for c in CREATURES:
        shutil.copy(os.path.join(evo, "art/creatures", f"{c}.png"), os.path.join(cdir, f"{c}.png"))
    print("wrote", OUT, "and", cdir)


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
