#!/usr/bin/env python3
"""Build the animated ambience sheets (fire, smoke, steam, water, leaves) from CC0 packs.

  python3 -I tools/ambience-art.py <download-dir>

<download-dir> must hold the unpacked packs below (download them from the pages listed; all are CC0 1.0):

  campfires_PNG.png      Idylwild's Chromatic Campfires   https://opengameart.org/content/idylwilds-chromatic-campfires
  16x16_Tiles_0.png      Animated tree and water (abetusk) https://opengameart.org/content/animated-tree-and-water
                         (the file is served as "16x16 Tiles_0.png"; rename the space to an underscore)
  Smoke_Small/           Reactorcore Fire Smoke Animations https://opengameart.org/content/fire-smoke-animations
                         (copy "Sprites/SmokeSmall_8x1" from the zip and rename it Smoke_Small)
  leaf.png               Ninja Adventure (Pixel-boy, AAA) https://github.com/pixel-boy/NinjaAdventure
                         (system/environment/fx/leaf.png)

Writes public/art/fx/: every sheet is one row of equal frames, left to right, at the packs' own 1x pixel size
(the renderer draws them at 2x, like the Ninja Adventure tiles). See src/render/fx.ts for frame sizes."""
import os, sys
from PIL import Image, ImageDraw

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
OUT = os.path.join(ROOT, "public", "art", "fx")
TW, TH = 64, 32


def strip(frames):
    w, h = frames[0].size
    out = Image.new("RGBA", (w * len(frames), h))
    for i, f in enumerate(frames):
        out.paste(f, (i * w, 0))
    return out


def recolour(im, mapping):
    im = im.convert("RGBA").copy(); px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if a and (r, g, b) in mapping:
                px[x, y] = mapping[(r, g, b)] + (a,)
    return im


def whiten(im, lift=0.65, alpha=1.0):
    """Grey smoke -> pale steam: pull every colour towards white, keeping its shading."""
    im = im.convert("RGBA").copy(); px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if a:
                px[x, y] = tuple(int(c + (255 - c) * lift) for c in (r, g, b)) + (int(a * alpha),)
    return im


def diamond_mask():
    m = Image.new("L", (TW, TH), 0)
    ImageDraw.Draw(m).polygon([(TW // 2, 0), (TW - 1, TH // 2), (TW // 2, TH - 1), (0, TH // 2)], fill=255)
    return m


def to_diamond(square):
    """32 x 32 top-down square -> 64 x 32 isometric top (the same cut as tools/iso-tiles.py)."""
    big = square.resize((square.width * 4, square.height * 4), Image.NEAREST)
    rot = big.rotate(45, resample=Image.NEAREST, expand=True)
    top = rot.resize((TW, TH), Image.NEAREST)
    out = Image.new("RGBA", (TW, TH))
    out.paste(top, (0, 0), diamond_mask())
    return out


def main(src):
    os.makedirs(OUT, exist_ok=True)
    camp = Image.open(os.path.join(src, "campfires_PNG.png")).convert("RGBA")
    # Campfires are 48 px apart; the smoky ones are 64 px tall from y 240 (orange first). Loose flames and
    # smoke columns are 16 x 32 cells in the right-hand 64 px (orange flames at y 96, grey smoke at 272).
    strip([camp.crop((i * 48, 240, i * 48 + 48, 304)) for i in range(4)]).save(os.path.join(OUT, "campfire.png"))
    flames = [camp.crop((192 + i * 16, 96, 208 + i * 16, 128)) for i in range(4)]
    strip(flames).save(os.path.join(OUT, "flame.png"))
    grey = [camp.crop((192 + i * 16, 272, 208 + i * 16, 304)) for i in range(4)]
    strip(grey).save(os.path.join(OUT, "smoke.png"))
    strip([whiten(f, 0.8, 0.9) for f in grey]).save(os.path.join(OUT, "steam.png"))
    # Small round puffs (12 x 12, 8 frames), whitened, for steam that boils off a tile.
    puffs = [Image.open(os.path.join(src, "Smoke_Small", f"Smoke_Small_{i}.png")) for i in range(1, 9)]
    strip([whiten(p, 0.55) for p in puffs]).save(os.path.join(OUT, "puff.png"))

    # Water: abetusk's four 16 px frames (x = 1 + 17 i, y = 51), recoloured to the Ninja Adventure water used
    # by top-water.png, tiled 2 x 2 and cut to a diamond. Each frame tiles with itself, so the diamond is seamless.
    tiles = Image.open(os.path.join(src, "16x16_Tiles_0.png")).convert("RGBA")
    pal = {(0, 69, 79): (86, 196, 222), (0, 89, 99): (113, 221, 238), (49, 157, 175): (206, 248, 252)}
    water = []
    for i in range(4):
        t = recolour(tiles.crop((1 + 17 * i, 51, 17 + 17 * i, 67)), pal)
        sq = Image.new("RGBA", (32, 32))
        for y in (0, 16):
            for x in (0, 16):
                sq.paste(t, (x, y))
        water.append(to_diamond(sq))
    strip(water).save(os.path.join(OUT, "water.png"))

    # Leaves: Ninja Adventure's six-frame tumbling leaf (12 x 7).
    Image.open(os.path.join(src, "leaf.png")).convert("RGBA").save(os.path.join(OUT, "leaf.png"))
    print("wrote", OUT)


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
