/* The hero's job branch (M3 draft, "Hero job branch"): halfway through the first region the hero takes one of two
   jobs, whichever the run's deeds lean towards (both are offered on a tie). The other stays locked for the run.
   Every starting hero (data/starters.ts) has its own pair: one that protects (the "beacon" lean: helping up,
   sparing, burning shards) and one that strikes (the "blaze" lean: finishing foes). */
import type { Line } from "./rivals";

export type Job = "beacon" | "blaze" | "bastion" | "fury" | "warden" | "hunter";
/** The two ways a run can lean, named after the first hero's jobs: protect (beacon) or strike (blaze). */
export type Lean = "beacon" | "blaze";
/** Passive a job gives: Guard cuts damage to allies next to the hero, Executioner hits wounded foes harder. */
export type Passive = "guard" | "executioner";

export interface JobInfo {
  id: Job;
  /** Which lean of the run offers it. */
  lean: Lean;
  name: Line;
  desc: Line;
  abilities: string[];
  passive: Passive;
}

export const GUARD_FACTOR = 0.9;
export const EXECUTIONER_FACTOR = 1.15;
/** First-region layer whose node, once finished, brings the job choice. */
export const JOB_LAYER = 3;

export const JOBS: Record<Job, JobInfo> = {
  beacon: {
    id: "beacon", lean: "beacon",
    name: { es: "Faro", en: "Beacon" },
    desc: {
      es: "Protector a media distancia. Halo escuda, cura y regenera a los aliados en cruz; Alba quita un mal estado. Los aliados junto al héroe reciben un 10% menos de daño.",
      en: "Protector at mid range. Halo shields, heals and regenerates allies in a cross; Dawn clears an ailment. Allies next to the hero take 10% less damage.",
    },
    abilities: ["halo", "dawn"],
    passive: "guard",
  },
  blaze: {
    id: "blaze", lean: "blaze",
    name: { es: "Fulgor", en: "Blaze" },
    desc: {
      es: "Lanzador agresivo. Abrasar quema; Deslumbrar aturde a un enemigo. +15% de daño a enemigos por debajo de la mitad de su vida.",
      en: "Aggressive caster. Sear burns; Dazzle stuns one foe. +15% damage to foes below half HP.",
    },
    abilities: ["sear", "dazzle"],
    passive: "executioner",
  },
  // The Vanguard's jobs.
  bastion: {
    id: "bastion", lean: "beacon",
    name: { es: "Bastión", en: "Bastion" },
    desc: {
      es: "Muro de hierro. Muralla escuda a los aliados en cruz a su alrededor; Rescate salta junto a un aliado y lo cura. Los aliados junto a la Vanguardia reciben un 10% menos de daño.",
      en: "Wall of iron. Rampart shields the allies in a cross around her; Rescue leaps next to an ally and heals them. Allies next to the Vanguard take 10% less damage.",
    },
    abilities: ["rampart", "rescue"],
    passive: "guard",
  },
  fury: {
    id: "fury", lean: "blaze",
    name: { es: "Furia", en: "Fury" },
    desc: {
      es: "Fuego sin freno. Infierno arrasa en cruz y quema; Remate golpea fuerte a un enemigo pegado. +15% de daño a enemigos por debajo de la mitad de su vida.",
      en: "Fire unbound. Inferno sweeps a cross and burns; Finisher hits an adjacent foe hard. +15% damage to foes below half HP.",
    },
    abilities: ["inferno", "finisher"],
    passive: "executioner",
  },
  // The Scout's jobs.
  warden: {
    id: "warden", lean: "beacon",
    name: { es: "Guardabosques", en: "Warden" },
    desc: {
      es: "Vigía del grupo. Viento a favor cura y da Regeneración a un aliado lejano; Cortina de humo escuda a los aliados en cruz. Los aliados junto al Batidor reciben un 10% menos de daño.",
      en: "The party's lookout. Tailwind heals a distant ally and gives Regen; Smoke Screen shields allies in a cross. Allies next to the Scout take 10% less damage.",
    },
    abilities: ["tailwind", "smokeScreen"],
    passive: "guard",
  },
  hunter: {
    id: "hunter", lean: "blaze",
    name: { es: "Cazador", en: "Hunter" },
    desc: {
      es: "Ojo de halcón. Tiro certero llega muy lejos y debilita; Lluvia de flechas cubre un área amplia. +15% de daño a enemigos por debajo de la mitad de su vida.",
      en: "Hawk's eye. Marked Shot reaches very far and weakens; Arrow Rain covers a wide area. +15% damage to foes below half HP.",
    },
    abilities: ["markedShot", "arrowRain"],
    passive: "executioner",
  },
};
