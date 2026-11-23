#!/usr/bin/env python3
"""Builds the humanoid foes' sprite sheets (and, where the pack has them, face portraits) into public/art/folk/.

  python3 tools/folk-art.py <path to the "PIPOYA FREE RPG Character Sprites 32x32" folder>

Sources (credited in CREDITS.md and on the title's credits screen):
- JS Actors - Aeon Warriors Field & Battle Sprites, by JosephSeraph, CC-BY 3.0
  https://opengameart.org/content/js-actors-aeon-warriors-field-battle-sprites (downloaded here): four martial
  artists, 24x32 walk frames in blocks of 3 columns x 4 rows (up, right, down, left) on a grey backdrop, battle
  poses under them (unused), and 48x48 faces in Hero_01_Faceset.png.
- Ratfolk, by Svetlana Kushnariova (lana-chan@yandex.ru), Stephen Challener (Redshrike) and Jordan Irwin
  (AntumDeluge), CC-BY 3.0 / OGA-BY 3.0 https://opengameart.org/content/ratfolk (downloaded here): same 24x32
  layout as our party's art, on a transparent backdrop.
- PIPOYA FREE RPG Character Sprites 32x32, by Pipoya (https://pipoya.itch.io/pipoya-free-rpg-character-sprites-32x32;
  free for commercial use, editing allowed, no credit required, the asset files themselves may not be resold or
  redistributed as assets). itch.io can't be reached from every machine, so pass the unzipped folder. 32x32 frames,
  3 columns x 4 rows (down, left, right, up). Pipoya's characters are big-headed chibis; to sit beside the 24x32 art
  they are slimmed here: the six plainest columns at the sides (three each side, clear of the eyes) and four plain
  rows of the hair's crown are dropped from every frame, picked once from the standing front frame so the walk stays
  steady. The eyes keep every pixel.

Each sheet uses the creature layout (src/render/iso.ts FACING_FRAME): ten 64x64 cells, two frames facing the viewer
(S), two away (N), two to the right (E; W is drawn flipped) and the downed pose in cell 9, art scaled 2x with the feet
where the creatures' are. Looks are listed in FOLK_LOOKS (src/data/units.ts)."""
import io
import os
import sys
import urllib.request
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
OUT = os.path.join(ROOT, "public", "art", "folk")
OGA = "https://opengameart.org/sites/default/files/"
K = 2
FEET = 61
# Pipoya slimming: columns closer to the middle than this hold the eyes; the crown is the hair above the face.
EYE_GAP, CROWN = 8, 7

# JS Actors: look -> fighter (0 long-haired brawler, 1 red-haired kicker, 2 purple-haired, 3 blue-haired man)
JS = {"pena": 0, "brasa": 1, "malva": 2, "marea": 3}
# Ratfolk (24x32, KusSv layout): look -> file
RATS = {"ratero": "ratfolk-m-001.png"}
# Pipoya: look -> file inside the pack folder
PIPOYA = {"trasgo": "Enemy/Enemy 18.png", "trasgo-chaman": "Enemy/Enemy 21.png"}


def fetch(name):
    req = urllib.request.Request(OGA + name, headers={"User-Agent": "tac-tics-art-tool"})
    return Image.open(io.BytesIO(urllib.request.urlopen(req).read())).convert("RGBA")


def clear(im, key):
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            if px[x, y][:3] == key:
                px[x, y] = (0, 0, 0, 0)
    return im


def backdrop_off(im, tol=12):
    """Clears the flat backdrop around the faces: every pixel joined to the image's edge whose colour is within tol
    of the top-left corner's."""
    px = im.load(); key = px[0, 0][:3]
    near = lambda p: p[3] and all(abs(a - b) <= tol for a, b in zip(p[:3], key))
    todo = [(x, y) for x in range(im.width) for y in (0, im.height - 1)] + [(x, y) for y in range(im.height) for x in (0, im.width - 1)]
    seen = set()
    while todo:
        x, y = todo.pop()
        if (x, y) in seen or not (0 <= x < im.width and 0 <= y < im.height) or not near(px[x, y]):
            continue
        seen.add((x, y)); px[x, y] = (0, 0, 0, 0)
        todo += [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)]
    return im


def sheet(frames, downed):
    """frames: S, S, N, N, E, E (each a small RGBA frame); downed: the pose for cell 9."""
    out = Image.new("RGBA", (10 * 64, 64), (0, 0, 0, 0))

    def put(fr, cell):
        big = fr.resize((fr.width * K, fr.height * K), Image.NEAREST)
        bb = big.getbbox()
        out.alpha_composite(big, (cell * 64 + (64 - big.width) // 2, FEET - bb[3]))
    for i, fr in enumerate(frames):
        put(fr, i)
    put(downed.crop(downed.getbbox()), 9)
    return out


def kus_frames(im, ox=0, fw=24, fh=32):
    """Walk frames from a block of 3 columns x 4 rows: up, right, down, left."""
    fr = lambda r, c: im.crop((ox + c * fw, r * fh, ox + c * fw + fw, r * fh + fh))
    return [fr(2, 0), fr(2, 2), fr(0, 0), fr(0, 2), fr(1, 0), fr(1, 2)], fr(2, 1)


def changes(fr, cells):
    """How much detail a run of pixels holds: the number of colour changes along it."""
    return sum(1 for a, b in zip(cells, cells[1:]) if fr.getpixel(a) != fr.getpixel(b))


def slim_plan(fr, ncols=6, nrows=4):
    """Columns and rows to drop. The eyes are left whole: columns are taken only from the sides (at least EYE_GAP from
    the middle, past the eyes) and rows only from the crown of the hair, above the face."""
    l, t, r, b = fr.getbbox()
    cx = (l + r) // 2
    col = lambda x: changes(fr, [(x, y) for y in range(t, b)])
    pairs = sorted(range(EYE_GAP, (r - l) // 2 - 1), key=lambda d: col(cx - d) + col(cx + d))
    cols = set()
    for d in pairs:
        if len(cols) >= ncols:
            break
        if l + 2 <= cx - d and cx + d < r - 2:
            cols |= {cx - d, cx + d}
    crown = range(t + 2, t + 2 + CROWN)
    rows = sorted(crown, key=lambda y: changes(fr, [(x, y) for x in range(l, r)]))[:nrows]
    return cols, set(rows)


def drop(fr, cols, rows):
    xs = [x for x in range(fr.width) if x not in cols]
    ys = [y for y in range(fr.height) if y not in rows]
    out = Image.new("RGBA", (len(xs), len(ys)), (0, 0, 0, 0))
    src, dst = fr.load(), out.load()
    for j, y in enumerate(ys):
        for i, x in enumerate(xs):
            dst[i, j] = src[x, y]
    return out


def pipoya(path):
    im = Image.open(path).convert("RGBA")
    fr = lambda r, c: im.crop((c * 32, r * 32, c * 32 + 32, r * 32 + 32))
    cols, rows = slim_plan(fr(0, 1))
    f = lambda r, c: drop(fr(r, c), cols, rows)
    lying = f(0, 1).rotate(90, expand=True)
    return sheet([f(0, 0), f(0, 2), f(3, 0), f(3, 2), f(2, 0), f(2, 2)], lying)


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    os.makedirs(OUT, exist_ok=True)
    js = clear(fetch("Heroes_01.png"), (78, 78, 78))
    faces = backdrop_off(fetch("Hero_01_Faceset.png"))
    for look, n in JS.items():
        frames, stand = kus_frames(js, n * 72)
        sheet(frames, stand.rotate(90, expand=True)).save(os.path.join(OUT, f"{look}.png"))
        faces.crop((0, n * 48, 48, n * 48 + 48)).resize((96, 96), Image.NEAREST).save(os.path.join(OUT, f"{look}-face.png"))
        print("wrote", look, "and its face")
    for look, f in RATS.items():
        frames, stand = kus_frames(fetch(f))
        sheet(frames, stand.rotate(90, expand=True)).save(os.path.join(OUT, f"{look}.png"))
        print("wrote", look)
    for look, f in PIPOYA.items():
        pipoya(os.path.join(sys.argv[1], f)).save(os.path.join(OUT, f"{look}.png"))
        print("wrote", look)


if __name__ == "__main__":
    main()
