#!/usr/bin/env python3
"""Builds the party's humanoid sprite sheets from "32x32 RPG Character Sprites" by Eldiran, CC0,
https://opengameart.org/content/32x32-rpg-character-sprites (see CREDITS.md). The pack was drawn for a tactics game
and has 20 job classes (knights, mages, thieves, ninjas...) in FFTA-like proportions.

  python3 tools/hero-art.py [RPGCharacterSprites32x32.png]

Downloads the pack's sheet (or reads the file given as the first argument) and writes public/art/heroes/<look>.png
for each look in JOBS, in the same layout as the creature sheets (src/render/iso.ts FACING_FRAME): ten 64x64 cells,
two frames facing the viewer (S), two facing away (N), two facing right (E; W is drawn flipped), the job's
"charging" pose in cell 6, and the downed pose in cell 9. The art is 32 px tall, scaled 2x, which is a 64 px cell.

Changes to the pack's art, all done here by script: the magenta backdrop becomes transparent, the blank faces get
two small dark eyes (one in profile), and the downed pose is the standing frame laid on its side with the eyes shut.
To dress a character as another job, change its row in JOBS (row 0 is the pack's blank template) and run this again;
the looks loaded from public/art/heroes/ are listed in HERO_LOOKS in src/main.ts."""
import io
import os
import sys
import urllib.request
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
OUT = os.path.join(ROOT, "public", "art", "heroes")
URL = "https://opengameart.org/sites/default/files/RPGCharacterSprites32x32.png"
CELL = 32
KEY = (255, 0, 255)
SKIN = (255, 229, 229)
EYE = (44, 34, 52, 255)
LIFT = 2  # art px the feet sit above the cell's bottom edge, like the creature sheets

# look -> the pack's row. Each companion's job suits who they are and their element.
JOBS = {
    "lumo": 10,      # the hero (light): red-haired swordsman in a white and blue coat
    "remolin": 13,   # Remanso (water, the healer): blue-robed mage
    "guijo": 4,      # Guijo (stone, carries the wounded): knight in full plate
    "centella": 14,  # Centella (bolt, the fast hunter): ninja
    "moheda": 6,     # Moheda (mush, heals with evidence): white-robed cleric
}


def load(src):
    data = open(src, "rb").read() if src else urllib.request.urlopen(URL).read()
    im = Image.open(io.BytesIO(data)).convert("RGBA")
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            if px[x, y][:3] == KEY:
                px[x, y] = (0, 0, 0, 0)
    return im


def cell(sheet, row, col):
    return sheet.crop((col * CELL, row * CELL, col * CELL + CELL, row * CELL + CELL))


def empty(fr):
    return fr.getbbox() is None


def face(fr):
    """The bare skin of the head (top half of the cell), or None when a mask or hood hides it."""
    px = fr.load()
    pts = [(x, y) for y in range(CELL // 2) for x in range(CELL) if px[x, y][:3] == SKIN]
    if len(pts) < 20:
        return None
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    return min(xs), min(ys), max(xs), max(ys)


def eyes(fr, profile=False):
    fr = fr.copy()
    box = face(fr)
    if not box:
        return fr
    x0, y0, x1, y1 = box
    px = fr.load()
    ey = y0 + (y1 - y0) // 2
    if profile:
        cols = [x1 - 2]
    else:
        w, cx = x1 - x0 + 1, (x0 + x1) / 2
        cols = [round(cx - w * 0.22) - 1, round(cx + w * 0.22)]
    for ex in cols:
        for dy in (0, 1):
            if px[ex, ey + dy][:3] == SKIN:
                px[ex, ey + dy] = EYE
    return fr


def downed(stand):
    """The standing frame tipped onto its back, head to the left, eyes shut (a short dark line)."""
    fr = stand.copy()
    box = face(fr)
    if box:
        x0, y0, x1, y1 = box
        px = fr.load()
        ey = y0 + (y1 - y0) // 2 + 1
        w, cx = x1 - x0 + 1, (x0 + x1) / 2
        for ex in (round(cx - w * 0.22) - 1, round(cx + w * 0.22)):
            for dx in (-1, 0):
                if px[ex + dx, ey][:3] == SKIN:
                    px[ex + dx, ey] = EYE
    lying = fr.rotate(90, expand=True)
    bb = lying.getbbox()
    return lying.crop(bb)


def build(sheet, row):
    out = Image.new("RGBA", (10 * 64, 64), (0, 0, 0, 0))

    def put(fr, col, bottom=True):
        big = fr.resize((fr.width * 2, fr.height * 2), Image.NEAREST)
        x = col * 64 + (64 - big.width) // 2
        y = 64 - big.height - LIFT * 2 if bottom else 0
        out.alpha_composite(big, (x, y))

    front = [cell(sheet, row, c) for c in range(4)]
    back = [cell(sheet, row, c) for c in range(4, 8)]
    side = [cell(sheet, row, c) for c in range(8, 12)]
    # Stepping in place, the way FFTA units idle: the two walk frames.
    put(eyes(front[1]), 0)
    put(eyes(front[2]), 1)
    put(back[1], 2)
    put(back[2], 3)
    walk = [s for s in (side[0], side[2]) if not empty(s)]
    stand = side[1] if not empty(side[1]) else next(s for s in side if not empty(s))
    a, b = (walk + [stand, stand])[:2] if len(walk) == 2 else (stand, stand)
    put(eyes(a, True), 4)
    put(eyes(b, True), 5)
    put(eyes(front[3]), 6)
    put(downed(front[0]), 9)
    return out


def main():
    sheet = load(sys.argv[1] if len(sys.argv) > 1 else None)
    os.makedirs(OUT, exist_ok=True)
    for look, row in JOBS.items():
        build(sheet, row).save(os.path.join(OUT, f"{look}.png"))
        print("wrote", f"public/art/heroes/{look}.png")


if __name__ == "__main__":
    main()
