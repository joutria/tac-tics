#!/usr/bin/env python3
"""Draw the phone app's launcher icons and splash screens from the hero's sprite (public/art/creatures/lumo.png,
front frame), pixel-scaled on the game's background colour. Overwrites the PNGs in android/app/src/main/res/.

  python3 -I tools/app-icon.py"""
import glob, os
from PIL import Image, ImageDraw

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
RES = os.path.join(ROOT, "android", "app", "src", "main", "res")
BG = (0x1d, 0x1f, 0x2b, 255)
RING = (0xff, 0xe0, 0x6b, 255)
DENSITY = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}


def hero():
    sheet = Image.open(os.path.join(ROOT, "public", "art", "creatures", "lumo.png")).convert("RGBA")
    frame = sheet.crop((0, 0, 64, 64))
    return frame.crop(frame.getbbox())


def place(canvas, sprite, share):
    """Pastes the sprite scaled by a whole number (hard pixel edges) to about `share` of the canvas, centred."""
    w, h = canvas.size
    k = max(1, int(min(w, h) * share / max(sprite.size)))
    s = sprite.resize((sprite.width * k, sprite.height * k), Image.NEAREST)
    canvas.alpha_composite(s, ((w - s.width) // 2, (h - s.height) // 2))
    return canvas


def main():
    sp = hero()
    for d, k in DENSITY.items():
        folder = os.path.join(RES, f"mipmap-{d}")
        fg = int(108 * k)
        # Adaptive icon: the launcher crops the outer third, so the hero sits in the middle 60%.
        place(Image.new("RGBA", (fg, fg), (0, 0, 0, 0)), sp, 0.5).save(os.path.join(folder, "ic_launcher_foreground.png"))
        size = int(48 * k)
        sq = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        ImageDraw.Draw(sq).rounded_rectangle((0, 0, size - 1, size - 1), radius=size // 6, fill=BG, outline=RING, width=max(1, size // 32))
        place(sq, sp, 0.7).save(os.path.join(folder, "ic_launcher.png"))
        rd = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        ImageDraw.Draw(rd).ellipse((0, 0, size - 1, size - 1), fill=BG, outline=RING, width=max(1, size // 32))
        place(rd, sp, 0.6).save(os.path.join(folder, "ic_launcher_round.png"))
    for path in glob.glob(os.path.join(RES, "drawable*", "splash.png")):
        w, h = Image.open(path).size
        place(Image.new("RGBA", (w, h), BG), sp, 0.25).convert("RGB").save(path)
    bg = os.path.join(RES, "values", "ic_launcher_background.xml")
    with open(bg, "w") as f:
        f.write('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#1D1F2B</color>\n</resources>\n')
    print("icons and splash screens written")


if __name__ == "__main__":
    main()
