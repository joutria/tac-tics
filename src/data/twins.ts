/* Twin cards (Dofus research doc, "How tac-tics could do it (twin cards)"): every hero card gets one twin with the
   same role and one thing changed. The player switches between a card and its twin for free on the run map,
   between nodes; the choice is part of the run save, so battles stay deterministic.
   Hero twins open from level 6 (Jose OK'd). Tagged twins also need their side of an alignment meter: tier 1 needs
   ALIGN.mark (20), signature twins need ALIGN.signature (50) and close for good once the other side locks in.
   Signature twins are twins of the job cards, so they need the job too. Numbers are first drafts for review. */
import type { Side } from "./alignment";

export interface Twin {
  /** The card it replaces, and the twin's own ability id (both in ABILITIES). */
  base: string;
  twin: string;
  /** Hero level the twin opens at. */
  level: number;
  /** The side of a meter it needs and moves when used; untagged twins need only the level. */
  tag?: Side;
  tier?: "mark" | "signature";
}

export const TWIN_LEVEL = 6;

export const TWINS: Twin[] = [
  { base: "blink", twin: "sidestep", level: TWIN_LEVEL },
  { base: "glow", twin: "graceGlow", level: TWIN_LEVEL, tag: "mercy", tier: "mark" },
  { base: "prism", twin: "verdict", level: TWIN_LEVEL, tag: "severity", tier: "mark" },
  { base: "flare", twin: "cleansingFlare", level: TWIN_LEVEL + 1, tag: "purity", tier: "mark" },
  { base: "ray", twin: "sapRay", level: TWIN_LEVEL + 1, tag: "sap", tier: "mark" },
  // Signature twins of the job cards: Beacon's for Mercy and Purity, Blaze's for Severity and the Sap.
  { base: "halo", twin: "sanctuary", level: TWIN_LEVEL + 2, tag: "mercy", tier: "signature" },
  { base: "dawn", twin: "purge", level: TWIN_LEVEL + 2, tag: "purity", tier: "signature" },
  { base: "sear", twin: "brand", level: TWIN_LEVEL + 2, tag: "severity", tier: "signature" },
  { base: "dazzle", twin: "sapBloom", level: TWIN_LEVEL + 2, tag: "sap", tier: "signature" },
];

export const twinOf = (base: string) => TWINS.find((t) => t.base === base);
