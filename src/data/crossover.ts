/* Crossover characters from Evolvlings (Jose: "Evolvlings people and creatures are late unlockable crossover
   characters"; plan doc "Crossover cast": Tila, the speakers and the story creatures). The camp opens them with late
   milestones; once open, each waits on a map of its region as a recruit, like the region's own companions. They
   come from the same world, from the valley the Caretaker looks after, a long way from the Sap-ruined town.
   Their companion data (values, lines) is in data/companions.ts; the lines are drafts for Jose to review. */
import type { Line } from "./rivals";
import type { Milestone } from "./camp";

export interface Crossover {
  /** Their id in COMPANIONS. */
  companion: string;
  /** Every milestone here must be reached, in any runs, for the camp to open them. */
  needs: Milestone[];
  /** Where they wait: the region (index into REGIONS) and map layer, and the talk that recruits them. */
  region: number;
  layer: number;
  talk: string;
  /** They only join while all of these companions travel with the party; otherwise `missing` is said instead. */
  withParty?: string[];
  missing?: Line;
  /** How the camp introduces them. */
  name: Line;
  desc: Line;
}

export const CROSSOVER: Crossover[] = [
  {
    companion: "tila", needs: ["runWon"], region: 0, layer: 4, talk: "tila.meet",
    name: { es: "Tila, la farolera", en: "Tila, the lamplighter" },
    desc: { es: "Encendía faroles con aceite robado en el Barrio Apagado. Ha bajado al pueblo arrasado siguiendo una luz que no debería estar ahí.", en: "She lit the Dim Quarter's lanterns with stolen oil. She came down to the ruined town following a light that shouldn't be there." },
  },
  {
    companion: "nim", needs: ["anyGood"], region: 1, layer: 2, talk: "nim.meet",
    name: { es: "Nim, el de los mapas", en: "Nim, who draws maps" },
    desc: { es: "El chico del lado de la noche que dibuja mapas de todo para que nada se pierda. Está cartografiando el embalse.", en: "The boy from the night side who draws maps of everything so nothing gets lost. He is mapping the reservoir." },
  },
  {
    companion: "unisona", needs: ["runWon", "anyGood"], region: 1, layer: 4, talk: "unisona.meet", withParty: ["tila", "nim"],
    missing: { es: "En la orilla, una criatura pequeña tararea media canción y se calla, como si esperara a dos voces más.", en: "On the shore, a small creature hums half a song and falls silent, as if waiting for two more voices." },
    name: { es: "Unísona", en: "Unísona" },
    desc: { es: "La criatura Estrella que nació de dos nanas cantadas a la vez. Solo se acerca si Tila y Nim viajan juntos.", en: "The Star creature born from two lullabies sung at once. She only comes near if Tila and Nim travel together." },
  },
];
