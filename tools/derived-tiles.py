#!/usr/bin/env python3
"""Tiles made from other tiles (placeholder art until we pick an isometric pack).

  python3 tools/derived-tiles.py

Needs Pillow. Reads public/art/iso/top-water.png and top-dirt.png (made by iso-tiles.py) and writes:
- top-ice.png: the water, pale and blue-white, with a few cracks.
- top-bridge.png: the dirt, darkened to wood, with plank lines across."""
import os
from PIL import Image, ImageDraw, ImageEnhance

ISO = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public", "art", "iso")
TW, TH = 64, 32


def inside(x, y):
    return abs(x - TW / 2) / (TW / 2) + abs(y - TH / 2) / (TH / 2) <= 1


def ice():
    im = Image.open(os.path.join(ISO, "top-water.png")).convert("RGBA")
    grey = ImageEnhance.Color(im).enhance(0.35)
    white = Image.new("RGBA", im.size, (225, 245, 255, 255))
    out = Image.blend(grey, white, 0.55)
    out.putalpha(im.getchannel("A"))
    d = ImageDraw.Draw(out)
    for a, b in [((20, 12), (30, 17)), ((30, 17), (27, 22)), ((38, 10), (45, 15)), ((33, 21), (41, 24))]:
        d.line([a, b], fill=(255, 255, 255, 230), width=1)
    out.save(os.path.join(ISO, "top-ice.png"))


def bridge():
    im = Image.open(os.path.join(ISO, "top-dirt.png")).convert("RGBA")
    wood = Image.blend(im, Image.new("RGBA", im.size, (120, 72, 36, 255)), 0.5)
    wood.putalpha(im.getchannel("A"))
    px = wood.load()
    # Planks run along one diagonal: a dark seam every 6 px across the other one.
    for y in range(TH):
        for x in range(TW):
            if inside(x, y) and (x // 2 + y) % 6 == 0:
                r, g, b, a = px[x, y]
                px[x, y] = (r // 2, g // 2, b // 2, a)
    wood.save(os.path.join(ISO, "top-bridge.png"))


if __name__ == "__main__":
    ice()
    bridge()
    print("wrote top-ice.png and top-bridge.png")
