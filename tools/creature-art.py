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
}
# look: (Evolvlings guardian, icy)
BOSSES = {"mira-broken": ("mira", True)}


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


def boss(evo, name, ice):
    g = Image.open(os.path.join(evo, "art", "guardians", name + ".png")).convert("RGBA")
    cell = g.crop((0, 0, 96, 96)).resize((64, 64), Image.NEAREST)
    if ice:
        cell = icy(cell)
    sheet = Image.new("RGBA", (640, 64))
    for i in range(10):
        sheet.paste(cell, (i * 64, 0))
    return sheet


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    evo = sys.argv[1]
    os.makedirs(OUT, exist_ok=True)
    for look, (name, stage) in SHEETS.items():
        row(evo, name, stage).save(os.path.join(OUT, look + ".png"))
    for look, (name, ice) in BOSSES.items():
        boss(evo, name, ice).save(os.path.join(OUT, look + ".png"))
    print("wrote", ", ".join(list(SHEETS) + list(BOSSES)))
