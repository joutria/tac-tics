/* Rival words: epithets, titles and taunts, Spanish and English side by side (plan doc gap 19: typed data).
   `tools/check.ts` checks both languages are filled. {name} is the rival, {hero} the party member in the story,
   {element} the element it learned to resist. */
export interface Line { es: string; en: string }

/** Added after the species name when a foe becomes a rival. Picked with the battle's seed. */
export const EPITHETS: Line[] = [
  { es: "el Tiznado", en: "the Scorched" },
  { es: "la Cicatriz", en: "Scar" },
  { es: "el Rencoroso", en: "the Spiteful" },
  { es: "Ojo de Savia", en: "Sap-Eye" },
  { es: "el Que Vuelve", en: "the Returning" },
  { es: "Media Sombra", en: "Halfshade" },
  { es: "el Astillado", en: "the Splintered" },
  { es: "la Marca Roja", en: "Red Mark" },
];

/** Why it is a rival, shown under its name. */
export const TITLES: Record<"escaped" | "felled", Line> = {
  escaped: { es: "Huyó de {hero} y no lo olvida", en: "Fled from {hero} and never forgot" },
  felled: { es: "Derribó a {hero}", en: "Felled {hero}" },
};

/** What it says when it shows up again, by the counter it brought this time. */
export const TAUNTS: Record<"resist" | "closer" | "slippery" | "hunter" | "first", Line> = {
  first: { es: "{name}: «Otra vez tú. Esta vez no me iré».", en: "{name}: \"You again. This time I won't run.\"" },
  resist: { es: "{name}: «Tu {element} ya no me quema como antes».", en: "{name}: \"Your {element} doesn't bite like it used to.\"" },
  closer: { es: "{name}: «¿Disparar desde lejos? Ya no hay lejos».", en: "{name}: \"Fighting from afar? There is no afar now.\"" },
  slippery: { es: "{name}: «Esta vez no me vas a acorralar».", en: "{name}: \"You won't pin me down this time.\"" },
  hunter: { es: "{name}: «Primero, el que te cura».", en: "{name}: \"Your healer goes first.\"" },
};
