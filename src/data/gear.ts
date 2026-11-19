/* Items, perks and rewards for runs (plan doc gaps 12 to 14), Spanish and English side by side.
   Items are fixed (no random affixes), come in three rarities, and some teach an ability while worn.
   `tools/check.ts` checks every name is filled and every taught ability exists. */
import type { Element } from "./elements";
import type { Line } from "./rivals";

export type Slot = "weapon" | "armour" | "charm";
export type Rarity = "common" | "rare" | "epic";

/** Stat changes an item or perk gives. */
export interface Mods {
  hp?: number; ap?: number; mp?: number; speed?: number; str?: number; mag?: number; agi?: number;
  res?: Partial<Record<Element, number>>;
}

export interface Item {
  id: string;
  slot: Slot;
  rarity: Rarity;
  name: Line;
  mods: Mods;
  /** Ability learned while worn. */
  teaches?: string;
  /** Shop price: coins for common and rare, Savia shards for epic. */
  price: number;
}

export const ITEMS: Record<string, Item> = {
  // Weapons
  ashStaff: { id: "ashStaff", slot: "weapon", rarity: "common", name: { es: "Bastón de ceniza", en: "Ash Staff" }, mods: { mag: 6 }, price: 30 },
  glassKnife: { id: "glassKnife", slot: "weapon", rarity: "common", name: { es: "Cuchillo de vidrio", en: "Glass Knife" }, mods: { str: 8, agi: 2 }, price: 30 },
  emberRod: { id: "emberRod", slot: "weapon", rarity: "rare", name: { es: "Vara de ascuas", en: "Ember Rod" }, mods: { mag: 4 }, teaches: "ember", price: 60 },
  vineWhip: { id: "vineWhip", slot: "weapon", rarity: "rare", name: { es: "Látigo de enredadera", en: "Vine Whip" }, mods: { str: 4 }, teaches: "snare", price: 60 },
  sunlance: { id: "sunlance", slot: "weapon", rarity: "epic", name: { es: "Lanza del alba", en: "Dawn Lance" }, mods: { mag: 14, speed: 4 }, price: 3 },
  // Armour
  patchedCoat: { id: "patchedCoat", slot: "armour", rarity: "common", name: { es: "Abrigo remendado", en: "Patched Coat" }, mods: { hp: 8 }, price: 25 },
  tileVest: { id: "tileVest", slot: "armour", rarity: "common", name: { es: "Chaleco de tejas", en: "Tile Vest" }, mods: { hp: 4, res: { fire: 15, plant: 15 } }, price: 30 },
  tideCloak: { id: "tideCloak", slot: "armour", rarity: "rare", name: { es: "Capa de marea", en: "Tide Cloak" }, mods: { hp: 6, res: { water: 25 } }, teaches: "splash", price: 55 },
  sapBark: { id: "sapBark", slot: "armour", rarity: "epic", name: { es: "Corteza sin savia", en: "Cleansed Bark" }, mods: { hp: 18, res: { fire: 10, plant: 10, water: 10 } }, price: 3 },
  // Charms
  bellCharm: { id: "bellCharm", slot: "charm", rarity: "common", name: { es: "Cascabel", en: "Little Bell" }, mods: { speed: 6 }, price: 25 },
  featherCharm: { id: "featherCharm", slot: "charm", rarity: "rare", name: { es: "Pluma ligera", en: "Light Feather" }, mods: { mp: 1 }, price: 70 },
  hourglass: { id: "hourglass", slot: "charm", rarity: "epic", name: { es: "Reloj de arena roto", en: "Broken Hourglass" }, mods: { ap: 1 }, price: 4 },
};

export interface Perk { id: string; name: Line; desc: Line; mods: Mods }

/** Every second level the hero picks 1 of 2 perks. */
export const PERKS: Record<string, Perk> = {
  vigor: { id: "vigor", name: { es: "Aguante", en: "Vigour" }, desc: { es: "+10 PV máximos.", en: "+10 max HP." }, mods: { hp: 10 } },
  focus: { id: "focus", name: { es: "Enfoque", en: "Focus" }, desc: { es: "+6 Magia.", en: "+6 Magic." }, mods: { mag: 6 } },
  might: { id: "might", name: { es: "Fuerza", en: "Might" }, desc: { es: "+6 Fuerza.", en: "+6 Strength." }, mods: { str: 6 } },
  stride: { id: "stride", name: { es: "Zancada", en: "Stride" }, desc: { es: "+1 PM.", en: "+1 MP." }, mods: { mp: 1 } },
  quick: { id: "quick", name: { es: "Reflejos", en: "Reflexes" }, desc: { es: "+8 Velocidad: actúas antes y más a menudo.", en: "+8 Speed: you act sooner and more often." }, mods: { speed: 8 } },
  slip: { id: "slip", name: { es: "Escurridizo", en: "Slippery" }, desc: { es: "+6 Agilidad: cuesta más bloquearte.", en: "+6 Agility: harder to pin down." }, mods: { agi: 6 } },
  ward: { id: "ward", name: { es: "Amparo", en: "Ward" }, desc: { es: "+15% de resistencia al fuego, la planta y el agua.", en: "+15% resistance to fire, plant and water." }, mods: { res: { fire: 15, plant: 15, water: 15 } } },
};

/** Level-ups: fixed growth each level, a perk pick every second level, up to the cap (gap 12). */
export const LEVEL_CAP = 12;
export const GROWTH: Mods = { hp: 4, str: 2, mag: 2 };
/** XP to go from level n to n+1. */
export const xpToNext = (level: number) => 20 + 10 * (level - 1);

/** Coins and XP a foe gives, scaled by how deep the node is; elites and the boss give more and drop shards. */
export const REWARD = {
  coinsPerFoe: 8, xpPerFoe: 10, perLayer: 0.15,
  eliteMult: 1.5, bossMult: 3, rivalMult: 2,
  eliteShards: 1, rivalShards: 1, bossShards: 2,
  /** Coins in the "purse" reward option. */
  purse: 25,
  /** Share of max HP the "patch up" reward option heals. */
  patchUp: 0.35,
};

export const SHOP = { stock: 4, healPrice: 15, heal: 0.5 };
