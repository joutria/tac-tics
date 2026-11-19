/* Abilities. Every character has a fixed set; run rewards will swap or upgrade them later.
   Damage is a range rolled on use (narrow = steady, wide = a gamble), scaled by the caster's Strength or Magic.
   Range is Manhattan distance. Ranged abilities gain 1 range per level the caster stands above the target and
   lose 1 per level below (never under 1); melee ones (max range 1) ignore height for reach. */
import type { Element } from "./elements";

export type Area = "single" | "cross1";
export type TargetKind = "foe" | "ally" | "downedAlly" | "any" | "emptyTile";

export interface Ability {
  id: string;
  element: Element;
  ap: number;
  range: [number, number];
  /** Needs line of sight to the target tile. */
  los: boolean;
  target: TargetKind;
  area: Area;
  /** Turns before it can be used again (0 = every turn). */
  cooldown: number;
  /** Uses allowed per turn. */
  perTurn: number;
  damage?: { min: number; max: number; stat: "str" | "mag" };
  heal?: { min: number; max: number };
  /** Pushes the target this many tiles away from the caster. */
  push?: number;
  /** Target loses all MP on its next turn. */
  root?: boolean;
  /** Caster jumps to the target tile. */
  teleport?: boolean;
  /** Stands a downed ally back up. */
  revive?: boolean;
}

export const ABILITIES: Record<string, Ability> = {
  // Shared by everyone.
  helpUp: { id: "helpUp", element: "neutral", ap: 3, range: [1, 1], los: false, target: "downedAlly", area: "single", cooldown: 0, perTurn: 1, revive: true },

  // The hero: mid-range, Light, Magic based.
  ray: { id: "ray", element: "light", ap: 3, range: [2, 5], los: true, target: "foe", area: "single", cooldown: 0, perTurn: 2, damage: { min: 7, max: 9, stat: "mag" } },
  flare: { id: "flare", element: "light", ap: 4, range: [1, 4], los: true, target: "any", area: "cross1", cooldown: 2, perTurn: 1, damage: { min: 5, max: 7, stat: "mag" } },
  prism: { id: "prism", element: "neutral", ap: 3, range: [1, 6], los: true, target: "foe", area: "single", cooldown: 1, perTurn: 1, damage: { min: 0, max: 20, stat: "mag" } },
  blink: { id: "blink", element: "light", ap: 2, range: [1, 3], los: false, target: "emptyTile", area: "single", cooldown: 3, perTurn: 1, teleport: true },
  glow: { id: "glow", element: "light", ap: 3, range: [0, 3], los: true, target: "ally", area: "single", cooldown: 2, perTurn: 1, heal: { min: 6, max: 8 } },

  // Chisporro: fire caster that keeps its distance.
  ember: { id: "ember", element: "fire", ap: 3, range: [2, 6], los: true, target: "foe", area: "single", cooldown: 0, perTurn: 2, damage: { min: 5, max: 8, stat: "mag" } },
  blaze: { id: "blaze", element: "fire", ap: 4, range: [2, 5], los: true, target: "any", area: "cross1", cooldown: 2, perTurn: 1, damage: { min: 4, max: 6, stat: "mag" } },

  // Cañín: plant bruiser that closes in and pins.
  bite: { id: "bite", element: "plant", ap: 3, range: [1, 1], los: false, target: "foe", area: "single", cooldown: 0, perTurn: 2, damage: { min: 8, max: 11, stat: "str" } },
  snare: { id: "snare", element: "plant", ap: 3, range: [1, 3], los: true, target: "foe", area: "single", cooldown: 3, perTurn: 1, damage: { min: 2, max: 4, stat: "str" }, root: true },

  // Ajolín: water skirmisher that shoves.
  splash: { id: "splash", element: "water", ap: 3, range: [1, 3], los: true, target: "foe", area: "single", cooldown: 0, perTurn: 2, damage: { min: 5, max: 7, stat: "str" } },
  undertow: { id: "undertow", element: "water", ap: 3, range: [1, 1], los: false, target: "foe", area: "single", cooldown: 2, perTurn: 1, damage: { min: 3, max: 5, stat: "str" }, push: 2 },
};
