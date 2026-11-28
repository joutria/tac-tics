#!/usr/bin/env python3
"""Creature sheets for units added after M2, cut from the Evolvlings art (Ninja Adventure, CC0).

  python3 tools/creature-art.py ../path/to/Evolvlings

Needs Pillow. An Evolvlings creature sheet is 640 x 192: 10 frames of 64 x 64 per row, one row per growth stage.
The game reads row 0, so each output is one row of 640 x 64 taken from the stage that fits the unit.
Guardians are single 96 x 96 pictures; the boss sheet repeats one, scaled to 64 x 64, in all 10 frames, and
"Broken" bosses get an icy tint with cracks. Writes public/art/creatures/<look>.png."""
import os, sys
from PIL import Image, ImageDraw, ImageEnhance

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
OUT = os.path.join(ROOT, "public", "art", "creatures")

# look: (Evolvlings creature, growth stage row)
SHEETS = {
    "relampin": ("relampin", 0),  # bolt foe of the Broken Reservoir
    "carambano": ("carambano", 0),  # ice foe
    "centella": ("relampin", 2),  # recruit: the grown-up storm fox
    "guijo": ("pebb", 1),  # recruit: the quarry's stone guardian
    "moheda": ("capuchon", 1),  # recruit: the pump houses' mushroom scholar
    "unisona": ("unisona", 1),  # crossover: the Star story creature
    "tiznajo": ("tiznajo", 0),  # the Sap mines: soot imp from the furnaces
    "topacio": ("topacio", 0),  # the Sap mines: stone miner
    "petardin": ("petardin", 0),  # the Sap mines: blasting-powder imp
    "colmillon": ("colmillon", 1),  # the Sap mines: tusked tunneller
    "calavero": ("calavero", 0),  # the Sap mines: skull-capped rock caster
    "yunqueron": ("yunqueron", 1),  # the Sap mines' brute: the anvil beast, drawn 2x2
    "eco": ("ecolito", 1),  # recruit: the mines' stone miner who sealed a shaft
    "ceniza": ("fogonero", 0),  # recruit: Forja's last stoker
}
# look: (Evolvlings guardian, tint): "ice" is frozen and cracked, "sap" blackened by the Sap with glowing seams.
BOSSES = {"mira-broken": ("mira", "ice"), "forja-sap": ("forja", "sap")}


def row(evo, name, stage):
    im = Image.open(os.path.join(evo, "art", "creatures", name + ".png")).convert("RGBA")
    stage = min(stage, im.height // 64 - 1)
    return im.crop((0, stage * 64, 640, stage * 64 + 64))


def icy(im):
    grey = ImageEnhance.Color(im).enhance(0.4)
    tint = Image.new("RGBA", im.size, (200, 235, 255, 255))
    out = Image.blend(grey, tint, 0.35)
    out.putalpha(im.getchannel("A"))
    d = ImageDraw.Draw(out)
    for a, b in [((20, 18), (30, 30)), ((30, 30), (26, 40)), ((44, 22), (38, 34))]:
        d.line([a, b], fill=(255, 255, 255, 220), width=1)
    # Keep the cracks inside the creature.
    out.putalpha(im.getchannel("A"))
    return out


def sapped(im):
    """Blackened by the Sap: dark violet over the colours, the brightest pixels kept as amber seams."""
    px = im.load()
    out = im.copy()
    po = out.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if not a:
                continue
            lum = (r * 3 + g * 6 + b) / 10
            if lum > 200:
                po[x, y] = (255, 196, 90, a)
            else:
                k = lum / 255
                po[x, y] = (int(40 + 120 * k), int(22 + 60 * k), int(52 + 90 * k), a)
    return out


def boss(evo, name, tint):
    g = Image.open(os.path.join(evo, "art", "guardians", name + ".png")).convert("RGBA")
    frames = [g.crop((i * 96, 0, i * 96 + 96, 96)).resize((64, 64), Image.NEAREST) for i in range(max(1, g.width // 96))]
    if tint == "ice":
        frames = [icy(f) for f in frames[:1]]
    elif tint == "sap":
        frames = [sapped(f) for f in frames]
    sheet = Image.new("RGBA", (640, 64))
    for i in range(10):
        sheet.paste(frames[(i // 2) % len(frames)], (i * 64, 0))
    return sheet


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    evo = sys.argv[1]
    os.makedirs(OUT, exist_ok=True)
    for look, (name, stage) in SHEETS.items():
        row(evo, name, stage).save(os.path.join(OUT, look + ".png"))
    for look, (name, tint) in BOSSES.items():
        boss(evo, name, tint).save(os.path.join(OUT, look + ".png"))
    print("wrote", ", ".join(list(SHEETS) + list(BOSSES)))
