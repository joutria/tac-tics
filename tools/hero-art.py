#!/usr/bin/env python3
"""Builds the party's humanoid sprite sheets from the Ninja Adventure characters (Pixel-boy and AAA, CC0), the same
pack the creatures, tiles and leaves come from, so the party matches the world. The characters are taken from the CC0
Superpowers character pack, which redistributes them: https://opengameart.org/content/superpowers-assets-characters
(see CREDITS.md).

  python3 tools/hero-art.py [superpowers-asset-packs-characters.zip]

Downloads the zip (or reads the file given as the first argument) and writes public/art/heroes/<look>.png for each
look in PICKS, in the same layout as the creature sheets (src/render/iso.ts FACING_FRAME): ten 64x64 cells, two
frames facing the viewer (S), two facing away (N), two facing right (E; W is drawn flipped), the attack pose in
cell 6, and the downed pose in cell 9. Each source sheet is 4 columns (down, up, left, right) by 7 rows of 16x16
frames: rows 0-3 walk, row 4 attack. The art is scaled 3x into the cell with its feet where the creatures' are.

The downed pose is the standing frame laid on its side, done here by script. To give someone another of the pack's
25 characters, change their number in PICKS and run this again; the looks loaded from public/art/heroes/ are listed
in HERO_LOOKS in src/data/units.ts."""
import io
import os
import sys
import urllib.request
import zipfile
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
OUT = os.path.join(ROOT, "public", "art", "heroes")
URL = "https://opengameart.org/sites/default/files/superpowers-asset-packs-characters.zip"
DIR = "characters/ninja-adventure/characters/"
F = 16          # source frame size
K = 3           # scale, as for the creature sheets
FEET = 60       # cell row the feet stand on, as for the creature sheets
DOWN, UP, LEFT, RIGHT = range(4)

# look -> the pack's character number. Each one suits who they are and their element.
PICKS = {
    "lumo": 6,       # the hero (light): red-haired young swordsman
    "remolin": 19,   # Remanso (water, the healer): blue and white hood
    "guijo": 15,     # Guijo (stone, carries the wounded): grey-helmed knight
    "centella": 24,  # Centella (bolt, the fast hunter): crimson ninja
    "moheda": 16,    # Moheda (mush, heals with evidence): red cap with white spots, like a toadstool
}


def load(src):
    data = open(src, "rb").read() if src else urllib.request.urlopen(URL).read()
    out = {}
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        for n in PICKS.values():
            out[n] = Image.open(io.BytesIO(z.read(f"{DIR}{n}.png"))).convert("RGBA")
    return out


def frame(sheet, row, col):
    return sheet.crop((col * F, row * F, col * F + F, row * F + F))


def build(sheet):
    out = Image.new("RGBA", (10 * 64, 64), (0, 0, 0, 0))

    def put(fr, cell):
        big = fr.resize((fr.width * K, fr.height * K), Image.NEAREST)
        bb = big.getbbox()
        out.alpha_composite(big, (cell * 64 + (64 - big.width) // 2, FEET - bb[3]))

    put(frame(sheet, 0, DOWN), 0)
    put(frame(sheet, 1, DOWN), 1)
    put(frame(sheet, 0, UP), 2)
    put(frame(sheet, 1, UP), 3)
    put(frame(sheet, 0, RIGHT), 4)
    put(frame(sheet, 1, RIGHT), 5)
    put(frame(sheet, 4, DOWN), 6)
    lying = frame(sheet, 0, DOWN).rotate(90, expand=True)
    put(lying.crop(lying.getbbox()), 9)
    return out


def main():
    sheets = load(sys.argv[1] if len(sys.argv) > 1 else None)
    os.makedirs(OUT, exist_ok=True)
    for look, n in PICKS.items():
        build(sheets[n]).save(os.path.join(OUT, f"{look}.png"))
        print("wrote", f"public/art/heroes/{look}.png")


if __name__ == "__main__":
    main()
