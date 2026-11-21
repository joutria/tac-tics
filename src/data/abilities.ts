/* Abilities. Every character has a fixed set; run rewards will swap or upgrade them later.
   Damage is a range rolled on use (narrow = steady, wide = a gamble), scaled by the caster's Strength or Magic.
   Range is Manhattan distance. Ranged abilities gain 1 range per level the caster stands above the target and
   lose 1 per level below (never under 1); melee ones (max range 1) ignore height for reach. */
import type { Element } from "./elements";
import type { Status } from "../engine/status";

export type Area = "single" | "cross1";
export type TargetKind = "foe" | "ally" | "downedAlly" | "any" | "emptyTile" | "yielding";

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
  /** The shared Shove: push distance comes from Strength (combat.ts shoveDistance), and heavy units resist. */
  shove?: boolean;
  /** Target loses all MP on its next turn. */
  root?: boolean;
  /** Caster jumps to the target tile. */
  teleport?: boolean;
  /** Stands a downed ally back up. */
  revive?: boolean;
  /** Spares a yielding foe: it kneels and leaves the fight, and never becomes a rival. */
  spare?: boolean;
  /** Left on every standing unit it hits (see src/engine/status.ts). */
  status?: Status;
  /** Removes harmful statuses from those it touches. */
  cleanse?: boolean;
  /** Its area touches only the caster's side. */
  alliesOnly?: boolean;
  /** Sap-fed: the caster loses this much HP on use (never below 1). */
  selfHurt?: number;
}

/** Shards the run must hold for Moheda's Sap Cap to grow stronger. */
export const SAP_RICH = 3;

export const ABILITIES: Record<string, Ability> = {
  // Shared by everyone.
  shove: { id: "shove", element: "neutral", ap: 0, range: [1, 1], los: false, target: "foe", area: "single", cooldown: 0, perTurn: 1, push: 1, shove: true },
  helpUp: { id: "helpUp", element: "neutral", ap: 3, range: [1, 1], los: false, target: "downedAlly", area: "single", cooldown: 0, perTurn: 1, revive: true },
  // The party only: a foe showing the white flag (under 25% HP, or fleeing) can be let go.
  spare: { id: "spare", element: "neutral", ap: 1, range: [1, 2], los: false, target: "yielding", area: "single", cooldown: 0, perTurn: 4, spare: true },

  // The hero: mid-range, Light, Magic based.
  ray: { id: "ray", element: "light", ap: 3, range: [1, 5], los: true, target: "foe", area: "single", cooldown: 0, perTurn: 2, damage: { min: 7, max: 9, stat: "mag" } },
  flare: { id: "flare", element: "light", ap: 4, range: [1, 4], los: true, target: "any", area: "cross1", cooldown: 2, perTurn: 1, damage: { min: 5, max: 7, stat: "mag" } },
  prism: { id: "prism", element: "neutral", ap: 3, range: [1, 6], los: true, target: "foe", area: "single", cooldown: 1, perTurn: 1, damage: { min: 0, max: 20, stat: "mag" } },
  blink: { id: "blink", element: "light", ap: 2, range: [1, 3], los: false, target: "emptyTile", area: "single", cooldown: 3, perTurn: 1, teleport: true },
  mend: { id: "mend", element: "water", ap: 3, range: [0, 3], los: true, target: "ally", area: "single", cooldown: 1, perTurn: 1, heal: { min: 7, max: 9 } },
  glow: { id: "glow", element: "light", ap: 3, range: [0, 3], los: true, target: "ally", area: "single", cooldown: 2, perTurn: 1, heal: { min: 6, max: 8 } },

  // Chisporro: fire caster that keeps its distance.
  ember: { id: "ember", element: "fire", ap: 3, range: [2, 6], los: true, target: "foe", area: "single", cooldown: 0, perTurn: 2, damage: { min: 5, max: 8, stat: "mag" } },
  blaze: { id: "blaze", element: "fire", ap: 4, range: [2, 5], los: true, target: "any", area: "cross1", cooldown: 2, perTurn: 1, damage: { min: 4, max: 6, stat: "mag" }, status: { id: "burn", turns: 2, power: 3 } },

  // Cañín: plant bruiser that closes in and pins.
  bite: { id: "bite", element: "plant", ap: 3, range: [1, 1], los: false, target: "foe", area: "single", cooldown: 0, perTurn: 2, damage: { min: 8, max: 11, stat: "str" } },
  snare: { id: "snare", element: "plant", ap: 3, range: [1, 3], los: true, target: "foe", area: "single", cooldown: 3, perTurn: 1, damage: { min: 2, max: 4, stat: "str" }, root: true },

  // Ajolín: water skirmisher that shoves.
  splash: { id: "splash", element: "water", ap: 3, range: [1, 3], los: true, target: "foe", area: "single", cooldown: 0, perTurn: 2, damage: { min: 5, max: 7, stat: "str" } },
  undertow: { id: "undertow", element: "water", ap: 3, range: [1, 1], los: false, target: "foe", area: "single", cooldown: 2, perTurn: 1, damage: { min: 3, max: 5, stat: "str" }, push: 2 },

  // Broken Reservoir. Relampín: bolt skirmisher whose sparks run along the water.
  spark: { id: "spark", element: "bolt", ap: 3, range: [2, 5], los: true, target: "foe", area: "single", cooldown: 0, perTurn: 2, damage: { min: 5, max: 8, stat: "mag" } },
  jolt: { id: "jolt", element: "bolt", ap: 4, range: [1, 1], los: false, target: "foe", area: "single", cooldown: 3, perTurn: 1, damage: { min: 3, max: 5, stat: "str" }, status: { id: "stun", turns: 1, power: 0 } },
  // Carámbano: ice bruiser that freezes the water into paths and slows.
  chill: { id: "chill", element: "ice", ap: 3, range: [1, 4], los: true, target: "foe", area: "single", cooldown: 1, perTurn: 1, damage: { min: 4, max: 6, stat: "str" }, status: { id: "slow", turns: 2, power: 1 } },
  freeze: { id: "freeze", element: "ice", ap: 4, range: [1, 4], los: true, target: "any", area: "cross1", cooldown: 3, perTurn: 1, damage: { min: 3, max: 5, stat: "mag" } },
  // Frost-touched foes of the reservoir learn a cold bite.
  frostbite: { id: "frostbite", element: "ice", ap: 3, range: [1, 1], los: false, target: "foe", area: "single", cooldown: 2, perTurn: 1, damage: { min: 4, max: 6, stat: "str" }, status: { id: "slow", turns: 1, power: 1 } },
  // Broken Mira, the boss: a guardian of the lake, frozen by the Sap.
  shatter: { id: "shatter", element: "ice", ap: 4, range: [2, 5], los: true, target: "any", area: "cross1", cooldown: 2, perTurn: 1, damage: { min: 6, max: 9, stat: "mag" }, status: { id: "slow", turns: 1, power: 1 } },
  glare: { id: "glare", element: "water", ap: 3, range: [1, 6], los: true, target: "foe", area: "single", cooldown: 0, perTurn: 2, damage: { min: 6, max: 8, stat: "mag" } },

  // Recruits of M3. Guijo: stone protector who holds a spot and shields allies.
  slam: { id: "slam", element: "stone", ap: 3, range: [1, 1], los: false, target: "foe", area: "single", cooldown: 0, perTurn: 2, damage: { min: 8, max: 11, stat: "str" } },
  bulwark: { id: "bulwark", element: "stone", ap: 3, range: [0, 2], los: false, target: "ally", area: "single", cooldown: 2, perTurn: 1, status: { id: "shield", turns: 2, power: 12 } },
  tremor: { id: "tremor", element: "stone", ap: 4, range: [1, 2], los: false, target: "any", area: "cross1", cooldown: 3, perTurn: 1, damage: { min: 3, max: 5, stat: "str" }, status: { id: "slow", turns: 1, power: 1 } },
  // Centella reuses the Relampín's spark and jolt, and darts past a foe's Lock.
  dash: { id: "dash", element: "bolt", ap: 2, range: [1, 3], los: true, target: "emptyTile", area: "single", cooldown: 2, perTurn: 1, teleport: true },
  // Moheda: weakens foes and keeps the party up over time, with the Savia's help.
  spores: { id: "spores", element: "mush", ap: 4, range: [1, 4], los: true, target: "any", area: "cross1", cooldown: 2, perTurn: 1, damage: { min: 2, max: 4, stat: "mag" }, status: { id: "poison", turns: 2, power: 3 } },
  wilt: { id: "wilt", element: "mush", ap: 3, range: [1, 5], los: true, target: "foe", area: "single", cooldown: 1, perTurn: 1, damage: { min: 4, max: 6, stat: "mag" }, status: { id: "weaken", turns: 2, power: 0 } },
  sapCap: { id: "sapCap", element: "mush", ap: 3, range: [0, 3], los: true, target: "ally", area: "single", cooldown: 2, perTurn: 1, heal: { min: 3, max: 4 }, status: { id: "regen", turns: 3, power: 3 } },
  // Hero jobs. Beacon: protector at mid range.
  halo: { id: "halo", element: "light", ap: 4, range: [0, 3], los: true, target: "any", area: "cross1", cooldown: 3, perTurn: 1, alliesOnly: true, heal: { min: 3, max: 5 }, status: { id: "shield", turns: 2, power: 8 } },
  dawn: { id: "dawn", element: "light", ap: 2, range: [0, 4], los: true, target: "ally", area: "single", cooldown: 2, perTurn: 1, cleanse: true, heal: { min: 2, max: 3 } },
  // Blaze: aggressive caster.
  sear: { id: "sear", element: "light", ap: 4, range: [1, 4], los: true, target: "foe", area: "single", cooldown: 1, perTurn: 1, damage: { min: 7, max: 9, stat: "mag" }, status: { id: "burn", turns: 2, power: 3 } },
  dazzle: { id: "dazzle", element: "light", ap: 3, range: [1, 5], los: true, target: "foe", area: "single", cooldown: 4, perTurn: 1, damage: { min: 2, max: 4, stat: "mag" }, status: { id: "stun", turns: 1, power: 0 } },
  /** Sap Cap when the run holds SAP_RICH shards or more. */
  // The hero's twin cards (data/twins.ts): each replaces one card above when the player picks it on the run map.
  sidestep: { id: "sidestep", element: "light", ap: 2, range: [1, 2], los: false, target: "emptyTile", area: "single", cooldown: 1, perTurn: 1, teleport: true },
  graceGlow: { id: "graceGlow", element: "light", ap: 3, range: [0, 4], los: true, target: "ally", area: "single", cooldown: 2, perTurn: 1, heal: { min: 4, max: 6 }, status: { id: "regen", turns: 2, power: 3 } },
  verdict: { id: "verdict", element: "neutral", ap: 3, range: [1, 4], los: true, target: "foe", area: "single", cooldown: 1, perTurn: 1, damage: { min: 9, max: 11, stat: "mag" } },
  cleansingFlare: { id: "cleansingFlare", element: "light", ap: 4, range: [1, 4], los: true, target: "any", area: "cross1", cooldown: 2, perTurn: 1, damage: { min: 4, max: 6, stat: "mag" }, cleanse: true },
  sapRay: { id: "sapRay", element: "neutral", ap: 3, range: [1, 5], los: true, target: "foe", area: "single", cooldown: 0, perTurn: 2, damage: { min: 10, max: 13, stat: "mag" }, selfHurt: 3 },
  sanctuary: { id: "sanctuary", element: "light", ap: 4, range: [0, 3], los: true, target: "any", area: "cross1", cooldown: 3, perTurn: 1, alliesOnly: true, heal: { min: 5, max: 7 }, status: { id: "shield", turns: 2, power: 12 } },
  purge: { id: "purge", element: "light", ap: 2, range: [0, 4], los: true, target: "any", area: "cross1", cooldown: 3, perTurn: 1, alliesOnly: true, cleanse: true, heal: { min: 3, max: 4 } },
  brand: { id: "brand", element: "light", ap: 4, range: [1, 4], los: true, target: "foe", area: "single", cooldown: 2, perTurn: 1, damage: { min: 10, max: 13, stat: "mag" }, status: { id: "weaken", turns: 2, power: 0 } },
  sapBloom: { id: "sapBloom", element: "neutral", ap: 3, range: [1, 4], los: true, target: "any", area: "cross1", cooldown: 3, perTurn: 1, damage: { min: 8, max: 11, stat: "mag" }, status: { id: "poison", turns: 2, power: 4 }, selfHurt: 5 },
  sapCapRich: { id: "sapCapRich", element: "mush", ap: 3, range: [0, 3], los: true, target: "ally", area: "single", cooldown: 2, perTurn: 1, heal: { min: 4, max: 6 }, status: { id: "regen", turns: 3, power: 5 } },
};
