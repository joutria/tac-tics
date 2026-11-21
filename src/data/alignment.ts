/* Alignment (Dofus research doc, "Proposal: alignment, twin cards and endings"; Jose approved two meters).
   The hero carries two meters, each from -100 to +100:
   - Mercy (+) vs Severity (-): sparing, helping up and cleansing against finishing and punishing.
   - Purity (+) vs Sap (-): burning the Savia out against taking its power.
   Each meter has three bands (MARK or more on one side, the middle, MARK or more on the other side), which gives
   nine alignments. They gate the hero's tagged twin cards (data/twins.ts) and pick the hero's ending.
   Words in both languages side by side; `tools/check.ts` checks them. */
import type { Line } from "./rivals";
import { MERCY } from "./mercy";

export type Meter = "mercy" | "purity";
/** A side of a meter, as a twin card's tag names it. */
export type Side = "mercy" | "severity" | "purity" | "sap";
export type Align = Record<Meter, number>;

export const SIDES: Record<Side, { meter: Meter; sign: 1 | -1 }> = {
  mercy: { meter: "mercy", sign: 1 }, severity: { meter: "mercy", sign: -1 },
  purity: { meter: "purity", sign: 1 }, sap: { meter: "purity", sign: -1 },
};

export const ALIGN = {
  /** Each meter runs from -max to +max. */
  max: 100,
  /** Band edge: this much on a side opens its tier-1 twins and counts for the alignment. */
  mark: 20,
  /** This much opens the side's signature twins. */
  signature: 50,
  /** Ordinary deeds move each meter at most this much per fight, so no single fight can be farmed. Settling a
      rival (spared or finished) is on top of it: it is the biggest choice a fight can hold. */
  perFight: 8,
  /** When a side locks in, closing the other side's signature twins for the rest of the run:
      "signature" = the moment the meter reaches ALIGN.signature on one side (the default);
      "regionEnd" = when a region's boss falls, for each meter already at ALIGN.signature or more.
      Change this one word to switch. */
  lockAt: "signature" as "signature" | "regionEnd",
  /** The twin screen warns when a meter is this close to locking. */
  warnWithin: 10,
};

/** How much each deed moves a meter (doc table "What moves them"). */
export const SHIFT = {
  /** Mercy +5 per foe spared, by the Spare action or after the win. */
  spare: MERCY.perSpare,
  /** Mercy -3 per yielding, fleeing or downed foe finished. */
  finish: -3,
  /** Mercy +2 per downed ally helped up. */
  helpUp: 2,
  /** Mercy +10 / -10 for sparing or finishing a rival (outside the per-fight cap). */
  rivalSpared: 10, rivalFinished: -10,
  /** Purity +5 for burning Savia shards at a rest's fire; Sap -5 for spending them on Sap-forged gear. */
  burnShards: 5, spendShards: -5,
  /** A tagged twin card used moves its own side by 1, once per card per fight. */
  tagged: 1,
};

export type Row = "merciful" | "measured" | "severe";
export type Col = "pure" | "wavering" | "sapTouched";
export type AlignmentId = "lantern" | "shepherd" | "graft" | "warden" | "wanderer" | "bargainer" | "purifier" | "hunter" | "crown";
export type Corner = "lantern" | "graft" | "purifier" | "crown";

/** Rows by Mercy, columns by Purity. */
export const GRID: Record<Row, Record<Col, AlignmentId>> = {
  merciful: { pure: "lantern", wavering: "shepherd", sapTouched: "graft" },
  measured: { pure: "warden", wavering: "wanderer", sapTouched: "bargainer" },
  severe: { pure: "purifier", wavering: "hunter", sapTouched: "crown" },
};

export const ALIGNMENTS: Record<AlignmentId, { name: Line; desc: Line }> = {
  lantern: { name: { es: "Farol", en: "Lantern" }, desc: { es: "Perdona y limpia la Savia.", en: "Spares, and cleanses the Sap." } },
  shepherd: { name: { es: "Redil", en: "Shepherd" }, desc: { es: "Perdona; con la Savia, aún duda.", en: "Spares; still unsure about the Sap." } },
  graft: { name: { es: "Injerto", en: "Graft" }, desc: { es: "Perdona, y carga con la Savia para salvar a otros.", en: "Spares, and carries the Sap to save others." } },
  warden: { name: { es: "Custodia", en: "Warden" }, desc: { es: "Mide cada golpe y quema la Savia.", en: "Weighs every blow, and burns the Sap." } },
  wanderer: { name: { es: "Errante", en: "Wanderer" }, desc: { es: "Aún no ha elegido camino.", en: "Has not chosen a path yet." } },
  bargainer: { name: { es: "Trato", en: "Bargainer" }, desc: { es: "Mide cada golpe y negocia con la Savia.", en: "Weighs every blow, and deals with the Sap." } },
  purifier: { name: { es: "Purga", en: "Purifier" }, desc: { es: "No perdona, y lo quema todo hasta limpiarlo.", en: "Shows no mercy, and burns everything clean." } },
  hunter: { name: { es: "Cacería", en: "Hunter" }, desc: { es: "No perdona; la Savia le da igual.", en: "Shows no mercy; the Sap is just another prey." } },
  crown: { name: { es: "Corona", en: "Crown" }, desc: { es: "No perdona, y gobierna con la Savia.", en: "Shows no mercy, and rules through the Sap." } },
};

export const SIDE_NAMES: Record<Side, Line> = {
  mercy: { es: "Piedad", en: "Mercy" }, severity: { es: "Severidad", en: "Severity" },
  purity: { es: "Pureza", en: "Purity" }, sap: { es: "Savia", en: "Sap" },
};

/* Hero endings: the four corners get a full ending each; the four edges get a shorter variant of the nearest
   corner (the one their other meter leans towards) plus a line of their own; the Wanderer gets the regular one. */
export const HERO_ENDINGS: { corners: Record<Corner, { full: Line; variant: Line }>; edges: Record<Exclude<AlignmentId, Corner | "wanderer">, Line>; regular: Line } = {
  corners: {
    lantern: {
      full: {
        es: "El héroe vuelve a cada pueblo que cruzó y enciende un fuego limpio en la plaza. Los que perdonó traen leña. La Savia retrocede palmo a palmo, y donde estuvo crece hierba nueva.",
        en: "The hero goes back to every town they crossed and lights a clean fire in the square. Those they spared bring the wood. The Sap retreats inch by inch, and where it stood, new grass grows.",
      },
      variant: {
        es: "El héroe enciende fuegos limpios por el camino. No llega a todos los pueblos, pero los que alcanza vuelven a respirar.",
        en: "The hero lights clean fires along the road. They do not reach every town, but the ones they reach breathe again.",
      },
    },
    graft: {
      full: {
        es: "El héroe se lleva la Savia dentro, toda la que puede, para que otros no tengan que hacerlo. Las vetas le suben por los brazos. Los que perdonó le cuidan por turnos, y nadie más enferma.",
        en: "The hero takes the Sap inside, as much as they can hold, so nobody else has to. The veins climb their arms. Those they spared take turns caring for them, and nobody else falls ill.",
      },
      variant: {
        es: "El héroe carga con un poco de Savia para aliviar a los demás. Le pesa, pero no está solo.",
        en: "The hero carries a little of the Sap to spare others. It weighs on them, but they are not alone.",
      },
    },
    purifier: {
      full: {
        es: "El héroe quema la Savia y todo lo que tocó: campos, casas, a los que no quisieron curarse. La región queda limpia y vacía, y el humo tarda un año en irse.",
        en: "The hero burns the Sap and everything it touched: fields, houses, those who would not be cured. The region is left clean and empty, and the smoke takes a year to lift.",
      },
      variant: {
        es: "El héroe quema la Savia sin mirar atrás. Lo que queda está limpio, aunque es menos que antes.",
        en: "The hero burns the Sap without looking back. What is left is clean, though there is less of it.",
      },
    },
    crown: {
      full: {
        es: "El héroe aprende a mandar a la Savia como a un perro. Los marcados se arrodillan ante él, y los pueblos tienen orden y pan. Nadie se atreve a preguntar a qué precio.",
        en: "The hero learns to command the Sap like a hound. The marked kneel before them, and the towns have order and bread. Nobody dares ask at what price.",
      },
      variant: {
        es: "El héroe usa la Savia para imponer orden. Funciona, por ahora.",
        en: "The hero uses the Sap to impose order. It works, for now.",
      },
    },
  },
  edges: {
    shepherd: { es: "Perdonó a muchos, pero nunca decidió qué hacer con la Savia, y eso le persigue.", en: "They spared many, but never decided what to do about the Sap, and it follows them still." },
    warden: { es: "No fue ni blando ni cruel; fue justo, y la gente lo recuerda así.", en: "They were neither soft nor cruel; they were fair, and that is how people remember them." },
    bargainer: { es: "Cada trato con la Savia le costó algo. Lleva la cuenta, por si un día hay que pagar.", en: "Every deal with the Sap cost something. They keep count, in case the bill comes due one day." },
    hunter: { es: "Cazó a todo lo que huía. Los caminos son seguros, y muy silenciosos.", en: "They hunted down everything that ran. The roads are safe, and very quiet." },
  },
  regular: {
    es: "El héroe sigue su camino sin haber elegido bando. La región sobrevive, ni mejor ni peor, esperando a alguien que decida por ella.",
    en: "The hero walks on without having chosen a side. The region survives, no better and no worse, waiting for someone to decide for it.",
  },
};
