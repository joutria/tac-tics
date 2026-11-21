/* Mercy: what sparing a foe pays, now and later (Dofus research doc, "Making mercy worth it"). Words in both
   languages side by side; `tools/check.ts` checks them. {name} is the spared foe. */
import type { Line } from "./rivals";

export const MERCY = {
  /** Points towards the Mercy side of the Mercy/Severity meter per foe spared (data/alignment.ts SHIFT.spare). */
  perSpare: 5,
  /** The gift a spared foe hands over at once: coins (times REWARD.purse, scaled by depth like it), a shard, or a heal
      (share of the hero's max HP). */
  giftCoins: 0.6, giftShards: 1, giftHeal: 0.2,
  /** Chance that a spared foe shows up to help at a later stop, per spared foe not yet seen again, up to `helpMax`. */
  helpPer: 0.2, helpMax: 0.6,
  /** A spared foe selling at a shop takes this share off every price. */
  discount: 0.25,
};

/** How a spared foe comes back: warns of an ambush (it is called off), fights beside the party once, or sells cheap. */
export type HelpKind = "warn" | "join" | "discount";

export const HELP_LINES: Record<HelpKind, Line> = {
  warn: { es: "{name}, a quien perdonaste, te avisa: hay una emboscada más adelante. Esta vez no te pillan por sorpresa.", en: "{name}, whom you spared, warns you of an ambush ahead. This time they won't catch you off guard." },
  join: { es: "{name}, a quien perdonaste, se une a ti en esta pelea.", en: "{name}, whom you spared, joins you for this fight." },
  discount: { es: "{name}, a quien perdonaste, atiende el puesto hoy: todo un 25% más barato.", en: "{name}, whom you spared, is minding the stall today: everything 25% off." },
};
