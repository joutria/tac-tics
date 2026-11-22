#!/usr/bin/env python3
"""Draws the board's rocks and trees: several shapes of each, in a palette per region.

  python3 tools/scenery-art.py

Needs Pillow. Original art, drawn pixel by pixel at 1x in the Ninja Adventure look the board already uses (dark
outline #141b1b, flat tones, light from the top left) and shown at 2x like every other board sprite. Shapes are
built from a few blobs (or tiers for pines, lines for bare trees); each pixel's tone comes from the facet of the blob
it sits on, so the shading is chunky and flat, not smooth. Moss and snow settle on the faces that look up.

Rocks are 28 x 26 with the tile's centre at (14, 22), drawn in three sizes (small, medium, big); trees are 40 x 40 with the tile's centre at (20, 36), about as
big as the pack's tree (obj-tree.png). Writes public/art/iso/rock-<region>-<n>-<s|m|l>.png and tree-<region>-<n>.png; the lists the
board picks from are ROCKS and TREES in src/render/scenery.ts and must name the same files."""
import math
import os
import random
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
OUT = os.path.join(ROOT, "public", "art", "iso")

INK = (20, 27, 27, 255)
SHADOW = (20, 27, 27, 90)
LIGHT = (-0.55, -0.65, 0.52)   # from the top left, a little towards the viewer

# ---- Palettes: dark, mid, light, highlight ----------------------------------------------------------------------
STONE = {
    "grey": [(70, 74, 86), (104, 110, 122), (146, 152, 162), (196, 200, 206)],
    "green": [(86, 99, 77), (95, 113, 96), (141, 151, 127), (182, 190, 176)],   # the pack's rock
    "sand": [(124, 88, 64), (168, 124, 86), (208, 166, 116), (238, 210, 162)],
    "slate": [(48, 46, 62), (74, 70, 92), (104, 100, 126), (146, 142, 168)],
    "frost": [(76, 92, 116), (108, 128, 154), (150, 172, 196), (204, 220, 236)],
}
MOSS = [(84, 102, 38), (116, 163, 52), (173, 188, 58)]
SNOW = [(168, 196, 222), (226, 238, 248), (255, 255, 255)]
LEAF = {
    "summer": [(84, 102, 38), (116, 163, 52), (173, 188, 58), (214, 222, 110)],   # the pack's tree
    "deep": [(36, 78, 50), (54, 114, 62), (88, 152, 78), (146, 194, 106)],
    "amber": [(148, 66, 40), (204, 102, 46), (236, 150, 62), (250, 202, 112)],
    "gold": [(122, 92, 34), (176, 140, 44), (222, 190, 70), (246, 226, 136)],
    "pine": [(30, 64, 62), (46, 96, 84), (76, 134, 104), (130, 176, 140)],
    "frostpine": [(40, 70, 80), (60, 100, 106), (96, 138, 136), (156, 190, 184)],
    "sickly": [(58, 64, 38), (90, 100, 48), (128, 136, 62), (174, 180, 98)],
    "plum": [(70, 42, 78), (108, 62, 112), (150, 92, 146), (200, 146, 190)],   # Sap-touched
}
BARK = [(84, 54, 40), (124, 82, 56), (164, 114, 76), (196, 150, 104)]
GREYBARK = [(70, 66, 70), (104, 98, 100), (142, 136, 132), (186, 180, 172)]
ROOT_ORANGE = [(150, 83, 64), (228, 109, 58), (240, 150, 90)]   # the pack's tree has orange roots


def rgba(c, a=255):
    return (c[0], c[1], c[2], a)


def norm(v):
    l = math.sqrt(sum(a * a for a in v)) or 1
    return tuple(a / l for a in v)


L = norm(LIGHT)


def outline(im):
    """Every opaque pixel that touches transparency on its side becomes ink."""
    px = im.load()
    w, h = im.size
    solid = [[px[x, y][3] == 255 for x in range(w)] for y in range(h)]
    out = im.copy()
    po = out.load()
    for y in range(h):
        for x in range(w):
            if solid[y][x] and any(not (0 <= x + dx < w and 0 <= y + dy < h) or not solid[y + dy][x + dx]
                                   for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                po[x, y] = INK
    return out


def with_shadow(im, cx, cy, rx, ry):
    """Puts a soft contact shadow (an ellipse) under the sprite's base."""
    out = Image.new("RGBA", im.size, (0, 0, 0, 0))
    px = out.load()
    for y in range(im.height):
        for x in range(im.width):
            if ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1:
                px[x, y] = SHADOW
    out.alpha_composite(im)
    return out


def blob_field(blobs, x, y):
    """The frontmost blob under pixel (x, y): (index, height, normal). Blobs are (cx, cy, rx, ry, lift); a blob's
    surface is a squashed dome, and `lift` pushes it towards the viewer so it wins over the ones behind."""
    best = None
    for i, (cx, cy, rx, ry, lift) in enumerate(blobs):
        dx, dy = (x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry
        d = dx * dx + dy * dy
        if d >= 1:
            continue
        z = math.sqrt(1 - d)
        if best is None or z + lift > best[1]:
            best = (i, z + lift, norm((dx, dy, z)))
    return best


def facet_tone(n, i, facets, bias=0.0):
    """Light on a facet: the normal is snapped to one of `facets` directions round the blob first, so each facet is
    one flat tone. Returns 0 (dark) .. 3 (highlight)."""
    ang = math.atan2(n[1], n[0])
    step = 2 * math.pi / facets
    a = round((ang + i * 0.7) / step) * step - i * 0.7
    flat = math.hypot(n[0], n[1])
    flat = 0.25 if flat < 0.45 else 0.8           # the crown of the blob, or its sides
    m = norm((math.cos(a) * flat, math.sin(a) * flat, math.sqrt(max(0.0, 1 - flat * flat))))
    l = m[0] * L[0] + m[1] * L[1] + m[2] * L[2] + bias
    return 0 if l < 0.12 else 1 if l < 0.5 else 2 if l < 0.82 else 3


# ---- Rocks --------------------------------------------------------------------------------------------------------
RW, RH, RBX, RBY = 28, 26, 14, 22
# Shapes below are drawn round a base at (12, 20) and grown by this, per rock size (src/engine/grid.ts RockSize):
# a small stone, a medium rock and a big boulder.
ROCK_K = {"s": 0.6, "m": 0.82, "l": 1.05}

# Shapes, as blobs round the base. Each is a boulder-sized stone that fills about two thirds of a tile.
ROCK_SHAPES = {
    "round": [(12, 14, 8.5, 7.5, 0), (8.5, 16.5, 5, 4, 0.15), (15.5, 16.5, 5, 4, 0.2)],
    "tall": [(12, 11, 6, 9, 0), (8, 16.5, 4.5, 4, 0.2), (16, 16, 4.5, 4.5, 0.25)],
    "split": [(9, 14, 6, 7, 0), (15.5, 15, 5.5, 6, 0.1), (12, 18, 6, 2.5, 0.35)],
    "slab": [(12, 15, 10, 5.5, 0), (7, 13, 5, 4, 0.1), (16.5, 17, 5, 3, 0.3)],
    "lump": [(11, 13, 7, 7, 0), (16, 13, 4, 4.5, 0.05), (12, 17.5, 8, 3, 0.3)],
}


def rock(shape, pal, cover=None, seed=0, cracks=2, size="l"):
    rnd = random.Random(seed)
    grow = ROCK_K[size]
    if size == "s":
        cracks = min(cracks, 1)
    blobs = [(RBX + (cx - 12) * grow, RBY - (20 - cy) * grow, rx * grow, ry * grow, lift) for cx, cy, rx, ry, lift in ROCK_SHAPES[shape]]
    im = Image.new("RGBA", (RW, RH), (0, 0, 0, 0))
    px = im.load()
    for y in range(RH):
        for x in range(RW):
            if y > RBY:
                continue
            hit = blob_field(blobs, x, y)
            if not hit:
                continue
            i, _, n = hit
            tone = facet_tone(n, i, 6)
            if y >= RBY - 1:
                tone = max(0, tone - 1)            # the foot sits in its own shade
            c = pal[tone]
            up = -n[1]                              # how much the face looks up (screen up)
            if cover == "moss" and up > 0.35 and rnd.random() < 0.85:
                c = MOSS[min(2, tone)] if tone else MOSS[0]
            if cover == "snow" and up > 0.45:
                c = SNOW[2 if tone >= 2 else 1]
            px[x, y] = rgba(c)
    # Cracks: short dark lines down the lit faces, a lighter edge beside them.
    for _ in range(cracks):
        for _try in range(30):
            x, y = rnd.randrange(5, RW - 5), rnd.randrange(6, RBY - 3)
            if px[x, y][3] == 255 and px[x, y][:3] in [p for p in pal[1:3]]:
                break
        else:
            continue
        for k in range(rnd.randint(2, 4)):
            if 0 <= x < RW and 0 <= y < RBY and px[x, y][3] == 255:
                px[x, y] = rgba(pal[0])
                if x + 1 < RW and px[x + 1, y][3] == 255 and px[x + 1, y][:3] != pal[0]:
                    px[x + 1, y] = rgba(pal[3])
            y += 1
            x += rnd.choice((-1, 0, 0, 1))
    im = outline(im)
    return with_shadow(im, RBX, RBY - 0.5, 11.5 * grow / 1.2, 3.8 * grow / 1.2)


# ---- Trees --------------------------------------------------------------------------------------------------------
TW_, TH_, TBX, TBY = 40, 40, 20, 36
# Shapes below are drawn round a trunk at x 16 with the crown's foot at `crown_bottom` (base at y 28), then grown.
TREE_K = 1.4


def trunk(px, top, bottom, half, bark, roots=None):
    """A trunk from `top` down to the base, `half` px each side of the centre, flaring at the foot."""
    for y in range(top, bottom + 1):
        flare = 1 if y >= bottom - 1 else 0
        for x in range(TBX - half - flare, TBX + half + flare):
            s = (x - (TBX - half - flare)) / max(1, 2 * (half + flare) - 1)
            tone = 2 if s < 0.3 else 1 if s < 0.75 else 0
            c = bark[tone]
            if roots and y >= bottom - 1:
                c = roots[min(2, tone)]
            px[x, y] = rgba(c)


def crown(px, blobs, leaf, rnd, cover=None, clumps=True):
    """Leaf clumps: each blob is one clump, shaded by its facets; where a clump in front ends over one behind, its
    lower rim is drawn dark, like the pack's tree."""
    owner = {}
    for y in range(TH_):
        for x in range(TW_):
            hit = blob_field(blobs, x, y)
            if not hit:
                continue
            i, _, n = hit
            owner[(x, y)] = i
            tone = facet_tone(n, i, 5, bias=0.08)
            c = leaf[tone]
            if cover == "snow" and -n[1] > 0.5:
                c = SNOW[2 if tone >= 2 else 1]
            if tone >= 2 and rnd.random() < 0.06:
                c = leaf[3]                      # a few bright leaves
            px[x, y] = rgba(c)
    if clumps:
        for (x, y), i in owner.items():
            below = owner.get((x, y + 1))
            if below is not None and below != i and blobs[below][4] < blobs[i][4]:
                continue
            if below is not None and below != i:
                px[x, y] = rgba(leaf[0])


def broadleaf(leaf, shape="round", bark=BARK, roots=ROOT_ORANGE, cover=None, seed=0):
    rnd = random.Random(seed)
    im = Image.new("RGBA", (TW_, TH_), (0, 0, 0, 0))
    px = im.load()
    shapes = {
        # a big round crown of five clumps
        "round": ([(16, 12, 11, 9, 0), (9, 15, 6.5, 5.5, 0.2), (23, 15, 6.5, 5.5, 0.2), (16, 18, 8, 5, 0.3), (14, 7, 6, 4.5, 0.1)], 19, 2),
        # taller and narrower, two layers
        "tall": ([(16, 9, 8, 7.5, 0), (16, 17, 9.5, 6, 0.2), (11, 13, 5, 5, 0.1), (21, 13, 5, 5, 0.12)], 21, 2),
        # three clumps side by side, low and wide
        "wide": ([(10.5, 13, 7.5, 7, 0.1), (21.5, 13, 7.5, 7, 0.1), (16, 9, 8, 6, 0), (16, 17, 9, 5, 0.3)], 20, 2),
        # a young tree: a small crown on a longer trunk
        "young": ([(16, 10, 8, 7, 0), (12, 13, 5, 4, 0.15), (20, 13, 5, 4, 0.18)], 16, 1),
    }
    blobs, crown_bottom, half = shapes[shape]
    # Grown round the crown's foot, so the trees stand as big as the pack's tree.
    k, foot = TREE_K, crown_bottom + (TBY - 28) - 1
    blobs = [(TBX + (cx - 16) * k, foot - (crown_bottom - cy) * k, rx * k, ry * k, lift) for cx, cy, rx, ry, lift in blobs]
    trunk(px, foot - 3, TBY, half + 1, bark, roots)
    crown(px, blobs, leaf, rnd, cover)
    im = outline(im)
    return with_shadow(im, TBX, TBY - 0.5, 12, 4)


def pine(leaf, tiers=4, cover=None, seed=0, bark=BARK):
    """A conifer: stacked tiers, each wider than the one above, with a jagged dark hem."""
    rnd = random.Random(seed)
    im = Image.new("RGBA", (TW_, TH_), (0, 0, 0, 0))
    px = im.load()
    trunk(px, TBY - 7, TBY, 2, bark)
    top, bottom = 1, TBY - 5
    span = (bottom - top) / tiers
    for t in range(tiers):
        y0 = top + t * span * 0.8
        y1 = y0 + span * 1.45
        w1 = min(17.0, 4 + (t + 1) * (13.0 / tiers))
        for y in range(int(y0), int(y1) + 1):
            f = (y - y0) / (y1 - y0)
            hw = 1 + f * w1
            for x in range(TBX - int(hw), TBX + int(hw) + 1):
                s = (x - TBX) / max(1.0, hw)          # -1 left .. 1 right
                tone = 3 if s < -0.55 and f < 0.75 else 2 if s < -0.1 else 1 if s < 0.5 else 0
                if f > 0.82:
                    tone = max(0, tone - 1)          # the shade under each tier's hem
                c = leaf[tone]
                if cover == "snow" and (f < 0.3 or (f < 0.55 and s < 0.1)) and rnd.random() < 0.9:
                    c = SNOW[2 if s < 0 else 1]
                px[x, y] = rgba(c)
        # a jagged hem: knock out a few pixels along the bottom of the tier
        yb = int(y1)
        for x in range(TBX - int(w1), TBX + int(w1) + 1):
            if (x + t) % 3 == 0 and px[x, yb][3]:
                px[x, yb] = (0, 0, 0, 0)
    im = outline(im)
    return with_shadow(im, TBX, TBY - 0.5, 11, 4)


def bare(bark, seed=0, twigs=None):
    """A dead tree: a trunk splitting into branches, no leaves (or a few dry ones)."""
    rnd = random.Random(seed)
    im = Image.new("RGBA", (TW_, TH_), (0, 0, 0, 0))
    px = im.load()

    def branch(x, y, ang, length, width):
        for k in range(int(length)):
            for w in range(-(width // 2), width - width // 2):
                xx = int(round(x + w * math.cos(ang + math.pi / 2)))
                yy = int(round(y))
                if 0 <= xx < TW_ and 0 <= yy < TH_:
                    tone = 2 if w < 0 else 1 if width > 1 else 1
                    px[xx, yy] = rgba(bark[tone])
            x += math.cos(ang)
            y += math.sin(ang)
        return x, y

    trunk(px, 22, TBY, 2, bark)
    x, y = branch(TBX, 23, -math.pi / 2 + rnd.uniform(-0.1, 0.1), 9, 4)
    for ang, ln in ((-math.pi / 2 - 0.7, 11), (-math.pi / 2 + 0.75, 12), (-math.pi / 2 - 0.1, 10)):
        ex, ey = branch(x, y, ang + rnd.uniform(-0.15, 0.15), ln, 2)
        for a2 in (ang - 0.6, ang + 0.5):
            tx, ty = branch(ex, ey, a2, rnd.randint(4, 7), 1)
            if twigs and rnd.random() < 0.8:
                for dx, dy in ((0, 0), (1, 0), (0, 1)):
                    if 0 <= int(tx) + dx < TW_ and 0 <= int(ty) + dy < TH_:
                        px[int(tx) + dx, int(ty) + dy] = rgba(twigs[rnd.randrange(1, 3)])
    branch(TBX - 3, 27, -math.pi / 2 - 1.1, 6, 2)
    im = outline(im)
    return with_shadow(im, TBX, TBY - 0.5, 9, 3)


# ---- What each region gets ----------------------------------------------------------------------------------------
def sets():
    # Each rock comes in every size (rock-<region>-<n>-<size>.png).
    specs = {
        "town": [("round", STONE["green"], None, 1), ("split", STONE["grey"], None, 2), ("lump", STONE["green"], "moss", 3),
                 ("slab", STONE["sand"], None, 4), ("tall", STONE["grey"], "moss", 5)],
        "frost": [("round", STONE["frost"], "snow", 11), ("split", STONE["frost"], None, 12), ("slab", STONE["grey"], "snow", 13),
                  ("tall", STONE["frost"], "snow", 14), ("lump", STONE["grey"], None, 15)],
        "hollow": [("round", STONE["slate"], "moss", 21), ("split", STONE["slate"], None, 22), ("lump", STONE["green"], "moss", 23),
                   ("tall", STONE["slate"], None, 24)],
    }
    rocks = {r: [{z: rock(sh, pal, cov, seed=sd, size=z) for z in ROCK_K} for sh, pal, cov, sd in v] for r, v in specs.items()}
    trees = {
        "town": [broadleaf(LEAF["summer"], "round", seed=1), broadleaf(LEAF["deep"], "tall", roots=None, seed=2),
                 broadleaf(LEAF["summer"], "wide", seed=3), broadleaf(LEAF["amber"], "round", roots=None, seed=4),
                 broadleaf(LEAF["gold"], "young", roots=None, seed=5), pine(LEAF["pine"], seed=6),
                 bare(GREYBARK, seed=7, twigs=LEAF["amber"])],
        "frost": [pine(LEAF["frostpine"], cover="snow", seed=11), pine(LEAF["pine"], tiers=3, cover="snow", seed=12),
                  broadleaf(LEAF["frostpine"], "tall", roots=None, cover="snow", seed=13), pine(LEAF["frostpine"], tiers=5, seed=14),
                  bare(GREYBARK, seed=15)],
        "hollow": [broadleaf(LEAF["sickly"], "round", roots=None, seed=21), broadleaf(LEAF["plum"], "tall", roots=None, seed=22),
                   bare(BARK, seed=23, twigs=LEAF["plum"]), broadleaf(LEAF["sickly"], "wide", roots=None, seed=24)],
    }
    return rocks, trees


def main():
    os.makedirs(OUT, exist_ok=True)
    rocks, trees = sets()
    for region, ims in rocks.items():
        for i, by_size in enumerate(ims):
            for z, im in by_size.items():
                im.save(os.path.join(OUT, f"rock-{region}-{i}-{z}.png"))
    for region, ims in trees.items():
        for i, im in enumerate(ims):
            im.save(os.path.join(OUT, f"tree-{region}-{i}.png"))
    print({r: len(v) for r, v in rocks.items()}, {r: len(v) for r, v in trees.items()})


if __name__ == "__main__":
    main()
