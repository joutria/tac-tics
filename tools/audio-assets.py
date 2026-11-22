#!/usr/bin/env python3
"""Build the game's sound effects and music (public/audio/) from CC0 packs, with ffmpeg.

  python3 -I tools/audio-assets.py <download-dir>

<download-dir> must hold these packs, unzipped into the folders named (all CC0 1.0):

  sfx512/   The Essential Retro Video Game Sound Effects Collection [512 sounds], Juhani Junkala
            https://opengameart.org/content/512-sound-effects-8-bit-style
  rpg/      50 RPG sound effects, Kenney          https://opengameart.org/content/50-rpg-sound-effects
  adv/      4 Chiptunes (Adventure), Juhani Junkala https://opengameart.org/content/4-chiptunes-adventure (OGG zip)

Every sound is written as a small mono MP3 (plays in every browser), music as a stereo MP3 at 96 kbps.
The names here are the ids src/audio/sounds.ts plays."""
import glob, os, subprocess, sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
OUT = os.path.join(ROOT, "public", "audio")

# id -> (pack, file name to find in it)
SFX = {
    # Interface.
    "select": ("sfx512", "sfx_menu_select2.wav"),
    "move": ("sfx512", "sfx_menu_move2.wav"),
    "error": ("sfx512", "sfx_sounds_error1.wav"),
    "coin": ("sfx512", "sfx_coin_double1.wav"),
    "buy": ("rpg", "handleCoins.ogg"),
    "page": ("rpg", "bookFlip1.ogg"),
    "equip": ("rpg", "clothBelt.ogg"),
    "levelUp": ("sfx512", "sfx_sounds_fanfare3.wav"),
    "victory": ("sfx512", "sfx_sounds_fanfare1.wav"),
    "defeat": ("sfx512", "sfx_sounds_negative2.wav"),
    "rest": ("sfx512", "sfx_sounds_powerup4.wav"),
    "door": ("rpg", "doorOpen_1.ogg"),
    # Battle.
    "step": ("rpg", "footstep02.ogg"),
    "slash": ("sfx512", "sfx_wpn_sword1.wav"),
    "hurt": ("sfx512", "sfx_damage_hit2.wav"),
    "crit": ("sfx512", "sfx_sounds_impact6.wav"),
    "down": ("sfx512", "sfx_sounds_falling3.wav"),
    "heal": ("sfx512", "sfx_sounds_powerup2.wav"),
    "shine": ("sfx512", "sfx_sounds_high3.wav"),
    "fire": ("sfx512", "sfx_exp_shortest_soft3.wav"),
    "zap": ("sfx512", "sfx_wpn_laser6.wav"),
    "splash": ("sfx512", "sfx_sounds_interaction5.wav"),
    "earth": ("sfx512", "sfx_sounds_impact1.wav"),
    "boom": ("sfx512", "sfx_exp_short_hard8.wav"),
    "break": ("rpg", "chop.ogg"),
    "guard": ("rpg", "metalPot1.ogg"),
    "spare": ("sfx512", "sfx_sounds_powerup10.wav"),
    "escape": ("sfx512", "sfx_movement_portal2.wav"),
}
MUSIC = {
    "map": ("adv", "1. Stage 1.ogg"),
    "battle": ("adv", "2. Stage 2.ogg"),
    "boss": ("adv", "3. Boss Fight.ogg"),
    "camp": ("adv", "4. Stage Select.ogg"),
}


def find(src, pack, name):
    hits = [p for p in glob.glob(os.path.join(src, pack, "**", "*"), recursive=True) if p.endswith(name)]
    if not hits:
        sys.exit(f"missing {name} in {pack}/")
    return hits[0]


def encode(src, dst, music):
    args = ["ffmpeg", "-loglevel", "error", "-y", "-i", src]
    args += ["-ac", "2", "-b:a", "96k"] if music else ["-ac", "1", "-ar", "44100", "-b:a", "64k"]
    subprocess.run(args + [dst], check=True)


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    src = sys.argv[1]
    os.makedirs(os.path.join(OUT, "music"), exist_ok=True)
    for id, (pack, name) in SFX.items():
        encode(find(src, pack, name), os.path.join(OUT, f"{id}.mp3"), False)
    for id, (pack, name) in MUSIC.items():
        encode(find(src, pack, name), os.path.join(OUT, "music", f"{id}.mp3"), True)
    print(f"wrote {len(SFX)} sounds and {len(MUSIC)} tracks to {OUT}")


if __name__ == "__main__":
    main()
