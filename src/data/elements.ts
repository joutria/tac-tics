/* The element wheel, ported from Evolvlings (rpg/data-cards.js TYPES).
   12 elements in 4 circles of 3: in each circle every element beats the next one. Each element also has an
   opposite. Star stays neutral. This table is the only place an element is defined; BEATS and OPPOSITE are derived. */

export const ELEMENTS = {
  fire:   { icon: "🔥", circle: "sol",   col: "#d9542c", opp: "water",  es: "Fuego",    en: "Fire" },
  plant:  { icon: "🌿", circle: "sol",   col: "#4f9a3c", opp: "mush",   es: "Planta",   en: "Plant" },
  light:  { icon: "☀️", circle: "sol",   col: "#e2ae2e", opp: "shadow", es: "Luz",      en: "Light" },
  bolt:   { icon: "⚡", circle: "sky",   col: "#d8b81c", opp: "ice",    es: "Rayo",     en: "Bolt" },
  air:    { icon: "🌬️", circle: "sky",   col: "#6fb8d0", opp: "stone",  es: "Aire",     en: "Air" },
  music:  { icon: "🎵", circle: "sky",   col: "#cf5f9f", opp: "dream",  es: "Música",   en: "Music" },
  water:  { icon: "💧", circle: "lake",  col: "#3f7fc9", opp: "fire",   es: "Agua",     en: "Water" },
  stone:  { icon: "🪨", circle: "lake",  col: "#8a7a64", opp: "air",    es: "Piedra",   en: "Stone" },
  shadow: { icon: "🌙", circle: "lake",  col: "#5b4b8e", opp: "light",  es: "Sombra",   en: "Shadow" },
  ice:    { icon: "❄️", circle: "frost", col: "#8fcbe0", opp: "bolt",   es: "Hielo",    en: "Ice" },
  mush:   { icon: "🍄", circle: "frost", col: "#b0603c", opp: "plant",  es: "Seta",     en: "Mushroom" },
  dream:  { icon: "💤", circle: "frost", col: "#8a78d4", opp: "music",  es: "Sueño",    en: "Dream" },
  star:   { icon: "✦",  circle: null,    col: "#e0b84a", opp: null,     es: "Estrella", en: "Star" },
} as const;

export type Element = keyof typeof ELEMENTS;
export const ELEMENT_IDS = Object.keys(ELEMENTS) as Element[];

const circleOf = (c: string) => ELEMENT_IDS.filter((e) => ELEMENTS[e].circle === c);
const CIRCLES = [...new Set(ELEMENT_IDS.map((e) => ELEMENTS[e].circle).filter((c): c is NonNullable<typeof c> => !!c))];

export const BEATS: Partial<Record<Element, Element>> = {};
for (const c of CIRCLES) {
  const es = circleOf(c);
  es.forEach((e, i) => { BEATS[e] = es[(i + 1) % es.length]; });
}

/** Damage multiplier of an attack of element `atk` on a target of element `def` (same numbers as Evolvlings). */
export function elementMultiplier(atk: Element, def: Element): number {
  if (atk === "star" || def === "star") return 1;
  if (BEATS[atk] === def) return 1.5;
  if (BEATS[def] === atk) return 0.75;
  if (ELEMENTS[atk].opp === def) return 1.25;
  return 1;
}
