"""Lever sprites for map levers (src/render/iso.ts drawProp). Source: "Lever and Button" by
FunnyDude, CC0 (https://opengameart.org/content/lever-and-button). The sheet is drawn at 8x; this crops the two lever frames and
scales them back to native pixels with a dark outline: public/art/iso/obj-lever.png (up) and obj-lever-on.png (pulled).
Usage: python3 tools/lever-art.py path/to/lever_and_button.png"""
import sys
from PIL import Image

SCALE = 8
im = Image.open(sys.argv[1]).convert("RGBA")
for name, box in (("obj-lever", (16, 24, 112, 112)), ("obj-lever-on", (144, 24, 240, 112))):
    frame = im.crop(box)
    w, h = frame.width // SCALE, frame.height // SCALE
    small = frame.resize((w, h), Image.NEAREST)
    # A 1px dark outline, so the small lever reads on dirt and grass like the other props.
    out = Image.new("RGBA", (w + 2, h + 2), (0, 0, 0, 0))
    a = small.split()[3]
    for dx, dy in ((0, 1), (1, 0), (2, 1), (1, 2)):
        out.paste((34, 26, 30, 255), (dx, dy), a)
    out.paste(small, (1, 1), small)
    small = out
    small.save(f"public/art/iso/{name}.png")
    print(name, small.size)
