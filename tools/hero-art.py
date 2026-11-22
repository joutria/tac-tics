#!/usr/bin/env python3
"""Builds the party's humanoid sprite sheets and face portraits from "24x32 characters with faces (big pack)" by
Svetlana Kushnariova, CC-BY 3.0, https://opengameart.org/content/24x32-characters-with-faces-big-pack (credited in
CREDITS.md and on the credits screen, as the licence asks).

  python3 tools/hero-art.py [24x32-characters-big-pack-by-Svetlana-Kushnariova.zip]

Downloads the pack's zip (or reads the file given as the first argument) and writes, for each look in PICKS:
- public/art/heroes/<look>.png, in the same layout as the creature sheets (src/render/iso.ts FACING_FRAME): ten
  64x64 cells, two frames facing the viewer (S), two facing away (N), two facing right (E; W is drawn flipped) and the
  downed pose in cell 9. Each source sheet holds 3 columns by 4 rows (up, right, down, left) of 24x32 walk frames on a
  teal backdrop, with the character's face portrait to the right. The art is scaled 2x with its feet where the
  creatures' are.
- public/art/heroes/<look>-face.png, the face portrait, cut out of the same sheet.

Changes made here by script: the teal backdrop becomes transparent, and the downed pose is the standing frame laid on
its side. To dress someone as another of the pack's characters, change PICKS and run this again; the looks loaded
from public/art/heroes/ are listed in HERO_LOOKS in src/data/units.ts."""
import io
import os
import sys
import urllib.request
import zipfile
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
OUT = os.path.join(ROOT, "public", "art", "heroes")
URL = "https://opengameart.org/sites/default/files/24x32-characters-big-pack-by-Svetlana-Kushnariova.zip"
FW, FH = 24, 32
K = 2
FEET = 61
KEY = (0, 117, 117)
UP, RIGHT, DOWN, LEFT = range(4)

# look -> the pack's file. Each one suits who they are and their element.
PICKS = {
    "lumo": "Heroes/Fighter-M-01",    # the hero (light): young swordsman
    "remolin": "Heroes/Healer-M-01",  # Remanso (water, the healer): healer in blue
    "guijo": "Heroes/Fighter-M-02",   # Guijo (stone, carries the wounded): sturdy fighter
    "centella": "Heroes/Ranger-F-01", # Centella (bolt, the fast hunter): ranger
    "moheda": "Heroes/Mage-F-01",     # Moheda (mush, heals with evidence): mage
}


def clear(im):
    im = im.convert("RGBA")
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            if px[x, y][:3] == KEY:
                px[x, y] = (0, 0, 0, 0)
    return im


def load(src):
    data = open(src, "rb").read() if src else urllib.request.urlopen(URL).read()
    out = {}
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        names = z.namelist()
        for look, f in PICKS.items():
            n = next(n for n in names if n.endswith(f + ".png"))
            out[look] = Image.open(io.BytesIO(z.read(n))).convert("RGBA")
    return out


def frame(sheet, row, col):
    return clear(sheet.crop((col * FW, row * FH, col * FW + FW, row * FH + FH)))


def face(sheet):
    """The portrait: the backdrop-coloured box right of the walk frames."""
    px = sheet.load()
    pts = [(x, y) for y in range(sheet.height) for x in range(3 * FW, sheet.width) if px[x, y][:3] == KEY]
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    return sheet.crop((min(xs), min(ys), max(xs) + 1, max(ys) + 1)).convert("RGBA")


def build(sheet):
    out = Image.new("RGBA", (10 * 64, 64), (0, 0, 0, 0))

    def put(fr, cell):
        big = fr.resize((fr.width * K, fr.height * K), Image.NEAREST)
        bb = big.getbbox()
        out.alpha_composite(big, (cell * 64 + (64 - big.width) // 2, FEET - bb[3]))

    # Stepping in place: the two stride frames (columns 0 and 2) of each walk row.
    put(frame(sheet, DOWN, 0), 0)
    put(frame(sheet, DOWN, 2), 1)
    put(frame(sheet, UP, 0), 2)
    put(frame(sheet, UP, 2), 3)
    put(frame(sheet, RIGHT, 0), 4)
    put(frame(sheet, RIGHT, 2), 5)
    lying = frame(sheet, DOWN, 1).rotate(90, expand=True)
    put(lying.crop(lying.getbbox()), 9)
    return out


def main():
    sheets = load(sys.argv[1] if len(sys.argv) > 1 else None)
    os.makedirs(OUT, exist_ok=True)
    for look, sheet in sheets.items():
        build(sheet).save(os.path.join(OUT, f"{look}.png"))
        face(sheet).save(os.path.join(OUT, f"{look}-face.png"))
        print("wrote", f"public/art/heroes/{look}.png and {look}-face.png")


if __name__ == "__main__":
    main()
