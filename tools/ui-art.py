#!/usr/bin/env python3
"""Cuts the window and button frames for the menus out of "Golden UI" by Buch, CC0,
https://opengameart.org/content/golden-ui (see CREDITS.md).

  python3 tools/ui-art.py [ui_split.png]

Downloads the pack's ui_split.png (or reads the path given) and writes nine-slice pictures to public/art/ui/:

  win.png       76x37: the gold-rimmed panel, its nine pieces glued back together (the sheet keeps them 1 px apart).
                CSS cuts it again at 7 10 7 9 (top, left, bottom, right; see .win in index.html).
  btn.png       32x16: the brown button, for plain buttons.
  btn-gold.png  32x16: the gold button, for the main button of a screen (End turn, Start).
  btn-lit.png   32x16: the gold button with its lit edge, for a button held down.
  btn-go.png    32x16: the gold button turned green, for Confirm / Go.
  btn-red.png   32x16: the gold button turned red, for a toggle that is on (Hold, Guard).

The pictures are shown at 1 art pixel per CSS pixel: on a phone that is 2 to 3 screen pixels, close to the board's
2x, and on a desktop screen it stays exactly sharp."""
import colorsys
import os
import sys
import urllib.request
from io import BytesIO
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
OUT = os.path.join(ROOT, "public", "art", "ui")
URL = "https://opengameart.org/sites/default/files/ui_split.png"

# Where the pieces sit on ui_split.png (inclusive pixel ranges).
PANEL_X = [(6, 15), (17, 73), (75, 83)]
PANEL_Y = [(13, 19), (21, 43), (45, 51)]
BUTTONS = {"btn-gold": 13, "btn-lit": 30, "btn": 47}  # top row of each 32x16 button at x 148..179


def glue(im, xs, ys):
    w = sum(b - a + 1 for a, b in xs)
    h = sum(b - a + 1 for a, b in ys)
    out = Image.new("RGBA", (w, h))
    oy = 0
    for y0, y1 in ys:
        ox = 0
        for x0, x1 in xs:
            out.paste(im.crop((x0, y0, x1 + 1, y1 + 1)), (ox, oy))
            ox += x1 - x0 + 1
        oy += y1 - y0 + 1
    return out


def hue_shift(im, to_hue, sat=1.0):
    """Turns the warm (gold) pixels to another hue, keeping their lightness; the dark outline stays as it is."""
    out = im.copy()
    px = out.load()
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            h, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
            if s < 0.25 or l < 0.15:
                continue
            r2, g2, b2 = colorsys.hls_to_rgb(to_hue, l, min(1.0, s * sat))
            px[x, y] = (round(r2 * 255), round(g2 * 255), round(b2 * 255), a)
    return out


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else None
    data = open(src, "rb").read() if src else urllib.request.urlopen(URL).read()
    im = Image.open(BytesIO(data)).convert("RGBA")
    os.makedirs(OUT, exist_ok=True)
    glue(im, PANEL_X, PANEL_Y).save(os.path.join(OUT, "win.png"))
    for name, top in BUTTONS.items():
        im.crop((148, top, 180, top + 16)).save(os.path.join(OUT, f"{name}.png"))
    gold = im.crop((148, 13, 180, 29))
    hue_shift(gold, 0.30, 0.55).save(os.path.join(OUT, "btn-go.png"))
    hue_shift(gold, 0.01, 0.9).save(os.path.join(OUT, "btn-red.png"))
    print("wrote", sorted(f for f in os.listdir(OUT) if f.startswith(("win", "btn"))))


if __name__ == "__main__":
    main()
