/* Status effects: lasting conditions an ability leaves on a unit.

   A status lasts a number of the unit's own turns. Burn and Poison hurt, and Regen heals, at the start of each
   of those turns. Slow takes MP at the start of each. Stun makes the unit lose its next turn. Shield soaks up
   damage until it is used up or runs out. Weaken makes the unit's attacks deal less.
   Effects of the same kind do not stack: a new one refreshes the turns and keeps the stronger power.
   Every number here is deterministic (no rolls), so it needs no random state. */

export type StatusId = "burn" | "poison" | "stun" | "slow" | "shield" | "regen" | "weaken";

export interface Status {
  id: StatusId;
  /** Own turns left. */
  turns: number;
  /** Damage or healing per turn, MP taken (Slow), or points of damage soaked (Shield). Unused by Stun and Weaken. */
  power: number;
}

export interface StatusInfo {
  icon: string;
  /** Good for the unit that has it (shown in green rather than red). */
  good: boolean;
  colour: string;
}

export const STATUS: Record<StatusId, StatusInfo> = {
  burn: { icon: "🔥", good: false, colour: "#ff9a4a" },
  poison: { icon: "☠", good: false, colour: "#b57be0" },
  stun: { icon: "💫", good: false, colour: "#ffe26b" },
  slow: { icon: "🐌", good: false, colour: "#9ab0c8" },
  weaken: { icon: "↓", good: false, colour: "#d08080" },
  shield: { icon: "⛨", good: true, colour: "#8fd0ff" },
  regen: { icon: "✚", good: true, colour: "#7ed957" },
};

/** Attacks by a weakened unit deal this share of their damage. */
export const WEAKEN_FACTOR = 0.75;
/** Healing on a poisoned unit is cut to this share. */
export const POISON_HEAL_FACTOR = 0.5;

interface HasStatuses { statuses: Status[]; stunGuard?: boolean }

export const statusOf = (u: HasStatuses, id: StatusId) => u.statuses.find((x) => x.id === id);

/** Puts a status on a unit, or refreshes the one it has. Returns false when it did not take (a stun right after
    another stun: a unit cannot be stunned again until it has had a turn, so stuns never chain). */
export function addStatus(u: HasStatuses, st: Status): boolean {
  if (st.id === "stun" && u.stunGuard) return false;
  const had = statusOf(u, st.id);
  if (had) { had.turns = Math.max(had.turns, st.turns); had.power = Math.max(had.power, st.power); }
  else u.statuses.push({ ...st });
  return true;
}

export function removeStatus(u: HasStatuses, id: StatusId) {
  u.statuses = u.statuses.filter((x) => x.id !== id);
}

/** At the end of the unit's own turn: one turn less on each status. */
export function tickDown(u: HasStatuses) {
  for (const x of u.statuses) x.turns -= 1;
  u.statuses = u.statuses.filter((x) => x.turns > 0);
}

/** Damage after the unit's Shield, which loses what it soaks. */
export function absorb(u: HasStatuses, dmg: number): number {
  const sh = statusOf(u, "shield");
  if (!sh || dmg <= 0) return dmg;
  const soaked = Math.min(sh.power, dmg);
  sh.power -= soaked;
  if (sh.power <= 0) removeStatus(u, "shield");
  return dmg - soaked;
}
