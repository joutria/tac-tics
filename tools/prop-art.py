#!/usr/bin/env python3
"""Draws the pixel-art props (crates and explosive barrels) for the battle board.

  python3 tools/prop-art.py

Needs Pillow. Original art, drawn pixel by pixel at 1x in the Ninja Adventure palette the board already uses
(dark outline #141b1b, warm browns), and shown at 2x like the pack's trees and rocks. The crate is an isometric
cube whose edges step 2 px across for 1 px down, exactly like the tile diamonds, so it sits square on a tile at
every camera angle. The barrel is round, so one picture serves every angle.

Writes public/art/iso/obj-crate.png, obj-crate-hurt.png (cracked, a plank knocked loose) and obj-barrel.png.
Each picture's bottom-centre pixel is the tile's centre (see drawProp in src/render/iso.ts)."""
import math
import os
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
OUT = os.path.join(ROOT, "public", "art", "iso")

INK = (20, 27, 27, 255)          # the pack's outline colour
SHADOW = (20, 27, 27, 90)        # contact shadow on the ground

# Wood, light to dark: lit top, left side, shaded right side; each with a frame tone and a seam tone.
WOOD = {
    "top": {"base": (214, 160, 98), "frame": (238, 196, 128), "seam": (150, 98, 56), "light": (250, 222, 160)},
    "left": {"base": (176, 118, 68), "frame": (204, 148, 88), "seam": (112, 70, 40), "light": (226, 172, 106)},
    "right": {"base": (130, 82, 48), "frame": (158, 106, 62), "seam": (82, 50, 32), "light": (176, 122, 72)},
}


def rgba(c, a=255):
    return (c[0], c[1], c[2], a)


def darker(c, k):
    return (round(c[0] * k), round(c[1] * k), round(c[2] * k), c[3] if len(c) > 3 else 255)


def outline(im):
    """Turns every opaque pixel that touches transparency (or the shadow) on its side into ink."""
    px = im.load()
    w, h = im.size
    solid = [[px[x, y][3] == 255 for x in range(w)] for y in range(h)]
    out = im.copy()
    po = out.load()
    for y in range(h):
        for x in range(w):
            if not solid[y][x]:
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if not (0 <= nx < w and 0 <= ny < h) or not solid[ny][nx]:
                    po[x, y] = INK
                    break
    return out


# ---- Crate -------------------------------------------------------------------------------------------------
HALF = 10          # half width in px: 20 wide on a 32 px wide tile (tiles are 64 px on screen, 32 at 1x)
HEIGHT = 11        # px of side wall


def crate(hurt=False):
    """Isometric cube, 20 px wide. Each pixel centre is mapped back to the face it falls on (u, v across the top,
    u or v plus t down a side), so every edge steps 2 px across per 1 px down, like the tiles."""
    W, H = HALF * 2, HALF + HEIGHT + 1
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    px = im.load()
    for y in range(H):
        for x in range(W):
            X, Y = x + 0.5 - HALF, y + 0.5
            u, v = (Y / (HALF / 2) + X / HALF) / 2, (Y / (HALF / 2) - X / HALF) / 2
            if 0 <= u < 1 and 0 <= v < 1:
                face, a, b = "top", u, v
            elif X < 0:
                uu = X / HALF + 1
                t = (Y - (uu + 1) * HALF / 2) / HEIGHT
                if not (0 <= uu < 1 and 0 <= t < 1):
                    continue
                face, a, b = "left", uu, t
            else:
                vv = 1 - X / HALF
                t = (Y - (vv + 1) * HALF / 2) / HEIGHT
                if not (0 <= vv < 1 and 0 <= t < 1):
                    continue
                face, a, b = "right", 1 - vv, t   # a: 0 at the front corner side... normalised below
            pal = WOOD[face]
            if face == "top":
                edge = min(a, b, 1 - a, 1 - b)
                if edge < 0.17:
                    c = pal["frame"]
                    if a > 0.9 or b > 0.9:
                        c = pal["light"]  # the lit front rims of the lid
                elif abs(b - 0.5) < 0.09:
                    c = pal["seam"]       # two boards laid along u
                else:
                    c = pal["base"]
            else:
                s = a if face == "left" else 1 - a   # 0 at the outer edge, 1 at the front corner
                t = b
                frame = s < 0.2 or s > 0.82 or t < 0.2 or t > 0.8
                brace = not frame and abs(t - s) < 0.12
                if frame:
                    c = pal["frame"]
                elif brace:
                    c = pal["frame"]
                else:
                    c = pal["seam"]                # the sunken boards between frame and brace
                if face == "left" and s > 0.92:
                    c = WOOD["top"]["light"]    # the front corner catches the light
                if t > 0.84 and (s < 0.12 or s > 0.9):
                    c = (90, 86, 100)            # iron corner caps
            px[x, y] = rgba(c)

    if hurt:
        for x, y in [(5, 13), (5, 14), (6, 15), (6, 16), (5, 17), (14, 12), (14, 13), (13, 14), (14, 15),
                     (8, 3), (9, 4), (11, 4), (12, 5)]:
            if px[x, y][3]:
                px[x, y] = INK
        for x, y in [(2, 12), (3, 12), (2, 13), (3, 13), (3, 14)]:   # a knocked-loose board: dark inside
            if px[x, y][3]:
                px[x, y] = rgba((52, 34, 26))
        for x in range(W):
            for y in range(H):
                r, g, b, al = px[x, y]
                if al == 255 and (r, g, b) != INK[:3]:
                    px[x, y] = darker((r, g, b, al), 0.82)

    im = outline(im)
    # Contact shadow: the base diamond grown by 2 px, peeking out round the bottom.
    full = Image.new("RGBA", (W + 4, H + 2), (0, 0, 0, 0))
    sh = full.load()
    for y in range(H + 2):
        for x in range(W + 4):
            X, Y = x + 0.5 - (HALF + 2), y + 0.5 - HEIGHT
            if abs(X) / (HALF + 2) + abs(Y - HALF / 2) / (HALF / 2 + 1) <= 1:
                sh[x, y] = SHADOW
    full.alpha_composite(im, (2, 0))
    return full


# ---- Barrel ------------------------------------------------------------------------------------------------
BARREL = [  # hand-placed, 14 x 17; K ink, letters below are the palette
    "....KKKKKK....",
    "..KKLLttttKK..",
    ".KLLLttttbtdK.",
    ".KddtttttdddK.",
    "KmllmmmmmggggK",
    "KRhhRrrrrrddDK",
    "KRhhRrrrrrddDK",
    "KRhhRrorrrddDK",
    "KRhhRoyyrrddDK",
    "KRhhRyyyorddDK",
    "KRhhRroyrrddDK",
    "KRhhRrrorrddDK",
    "KRhhRrrrrrddDK",
    "KmllmmmmmggggK",
    "KRhhRrrrrrddDK",
    ".KdddddddddDK.",
    "..KKKKKKKKKK..",
]
BARREL_PAL = {
    "K": INK[:3], "D": (98, 28, 26), "d": (146, 42, 34), "r": (190, 60, 44), "R": (222, 94, 62), "h": (246, 152, 108),
    "t": (198, 76, 52), "L": (232, 122, 86), "b": INK[:3],
    "g": (46, 46, 58), "m": (92, 90, 108), "l": (156, 154, 172), "y": (255, 216, 72), "o": (246, 146, 40),
}


def barrel():
    """An upright red powder keg: lit lid with a bung, two iron hoops, a yellow blast mark on the front."""
    W, H = len(BARREL[0]), len(BARREL)
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    px = im.load()
    for y, row in enumerate(BARREL):
        assert len(row) == W, (y, row)
        for x, ch in enumerate(row):
            if ch != ".":
                px[x, y] = rgba(BARREL_PAL[ch])
    full = Image.new("RGBA", (W + 4, H + 1), (0, 0, 0, 0))
    sh = full.load()
    for y in range(H + 1):
        for x in range(W + 4):
            ex, ey = (x + 0.5 - (W + 4) / 2) / ((W + 4) / 2), (y + 0.5 - (H - 1.5)) / 2.5
            if ex * ex + ey * ey <= 1:
                sh[x, y] = SHADOW
    full.alpha_composite(im, (2, 0))
    return full


def main():
    os.makedirs(OUT, exist_ok=True)
    crate(False).save(os.path.join(OUT, "obj-crate.png"))
    crate(True).save(os.path.join(OUT, "obj-crate-hurt.png"))
    barrel().save(os.path.join(OUT, "obj-barrel.png"))
    print("wrote obj-crate.png, obj-crate-hurt.png, obj-barrel.png to", OUT)


if __name__ == "__main__":
    main()
