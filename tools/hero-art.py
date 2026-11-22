#!/usr/bin/env python3
"""Builds the party's humanoid sprite sheets and face portraits from Svetlana Kushnariova's redrawn heroes in
"24x32 characters, 16x16 tiles" (KusSv), CC-BY 3.0, https://opengameart.org/content/24x32-characters-16x16-tiles
(credited in CREDITS.md and on the credits screen, as the licence asks).

  python3 tools/hero-art.py [path to the extracted Heroes_by_KusSv folder]

With no argument it downloads Heroes_by_KusSv.7z (unpacking it needs the py7zr module). For each look in PICKS it
writes:
- public/art/heroes/<look>.png, in the same layout as the creature sheets (src/render/iso.ts FACING_FRAME): ten
  64x64 cells, two frames facing the viewer (S), two facing away (N), two facing right (E; W is drawn flipped) and the
  downed pose in cell 9. Each source sheet holds up to eight outfits in blocks of 3 columns by 4 rows (up, right,
  down, left) of 24x32 walk frames on a teal backdrop. The art is scaled 2x with its feet where the creatures' are.
- public/art/heroes/<look>-face.png, the character's neutral face portrait (the pack has eight expressions each).

Changes made here by script: the teal backdrop becomes transparent, and the downed pose is the standing frame laid on
its side. To dress someone in another of the pack's outfits, change PICKS and run this again; the looks loaded from
public/art/heroes/ are listed in HERO_LOOKS in src/data/units.ts."""
import io
import os
import sys
import tempfile
import urllib.request
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
OUT = os.path.join(ROOT, "public", "art", "heroes")
URL = "https://opengameart.org/sites/default/files/Heroes_by_KusSv.7z"
FW, FH = 24, 32
K = 2
FEET = 61
KEY = (0, 117, 117)
UP, RIGHT, DOWN, LEFT = range(4)

# look -> (walk sheet, outfit block 0-7, neutral face), paths inside Heroes_by_KusSv. Each suits who they are.
PICKS = {
    "lumo": ("all-class Yan/Yan_char.png", 4, "all-class Yan/Faces/fighter/Yan_face_fighter_neutral.png"),     # the hero: fighter in blue plate
    "remolin": ("Healer Evan/Evan_char.png", 0, "Healer Evan/Faces/Evan_face_neutral.png"),                      # Remanso: healer in blue and white
    "guijo": ("Soldier Roland/Roland_char.png", 4, "Soldier Roland/Faces/Roland_helm_face_neutral.png"),         # Guijo: helmed soldier in mail
    "centella": ("Ranger Ruby/Ruby_char.png", 0, "Ranger Ruby/Faces/Ruby_face_neutral.png"),                     # Centella: ranger
    "moheda": ("all-class Lyuba/Lyuba_char.png", 6, "all-class Lyuba/Faces/mage/Lyuba_face_mage_neutral.png"),   # Moheda: mage in a crimson hood
}


def clear(im):
    im = im.convert("RGBA")
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            if px[x, y][:3] == KEY:
                px[x, y] = (0, 0, 0, 0)
    return im


def source():
    if len(sys.argv) > 1:
        return sys.argv[1]
    import py7zr  # only needed to unpack the download
    tmp = tempfile.mkdtemp()
    with py7zr.SevenZipFile(io.BytesIO(urllib.request.urlopen(URL).read())) as z:
        z.extractall(tmp)
    return os.path.join(tmp, "Heroes_by_KusSv")


def frame(sheet, block, row, col):
    bx, by = block % 4, block // 4
    x, y = bx * 3 * FW + col * FW, by * 4 * FH + row * FH
    return clear(sheet.crop((x, y, x + FW, y + FH)))


def face(path):
    """The bust at the bottom of the face image, cut square."""
    im = Image.open(path).convert("RGBA")
    w = im.width
    return im.crop((0, im.height - w, w, im.height))


def build(sheet, block):
    out = Image.new("RGBA", (10 * 64, 64), (0, 0, 0, 0))

    def put(fr, cell):
        big = fr.resize((fr.width * K, fr.height * K), Image.NEAREST)
        bb = big.getbbox()
        out.alpha_composite(big, (cell * 64 + (64 - big.width) // 2, FEET - bb[3]))

    # Stepping in place: the two stride frames (columns 0 and 2) of each walk row.
    put(frame(sheet, block, DOWN, 0), 0)
    put(frame(sheet, block, DOWN, 2), 1)
    put(frame(sheet, block, UP, 0), 2)
    put(frame(sheet, block, UP, 2), 3)
    put(frame(sheet, block, RIGHT, 0), 4)
    put(frame(sheet, block, RIGHT, 2), 5)
    lying = frame(sheet, block, DOWN, 1).rotate(90, expand=True)
    put(lying.crop(lying.getbbox()), 9)
    return out


def main():
    src = source()
    os.makedirs(OUT, exist_ok=True)
    for look, (walk, block, face_file) in PICKS.items():
        build(Image.open(os.path.join(src, walk)), block).save(os.path.join(OUT, f"{look}.png"))
        face(os.path.join(src, face_file)).save(os.path.join(OUT, f"{look}-face.png"))
        print("wrote", f"public/art/heroes/{look}.png and {look}-face.png")


if __name__ == "__main__":
    main()
