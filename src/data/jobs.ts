/* The hero's job branch (M3 draft, "Hero job branch"): halfway through the first region the hero takes Beacon or
   Blaze, whichever the run's deeds lean towards (both are offered on a tie). The other stays locked for the run. */
import type { Line } from "./rivals";

export type Job = "beacon" | "blaze";
/** Passive a job gives: Guard cuts damage to allies next to the hero, Executioner hits wounded foes harder. */
export type Passive = "guard" | "executioner";

export interface JobInfo {
  id: Job;
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
    id: "beacon",
    name: { es: "Faro", en: "Beacon" },
    desc: {
      es: "Protector a media distancia. Halo escuda y cura a los aliados en cruz; Alba quita un mal estado. Los aliados junto al héroe reciben un 10% menos de daño.",
      en: "Protector at mid range. Halo shields and heals allies in a cross; Dawn clears an ailment. Allies next to the hero take 10% less damage.",
    },
    abilities: ["halo", "dawn"],
    passive: "guard",
  },
  blaze: {
    id: "blaze",
    name: { es: "Fulgor", en: "Blaze" },
    desc: {
      es: "Lanzador agresivo. Abrasar quema; Deslumbrar aturde a un enemigo. +15% de daño a enemigos por debajo de la mitad de su vida.",
      en: "Aggressive caster. Sear burns; Dazzle stuns one foe. +15% damage to foes below half HP.",
    },
    abilities: ["sear", "dazzle"],
    passive: "executioner",
  },
};
