/* The camp between runs (M4, plan doc "Meta progression": unlocks only, never permanent stats). What a player has
   done across runs (milestones, run/legacy.ts) opens starting kits and lore pages. Kits only change what the hero
   sets out with; a run is still lost or won on the map. Lore lines are drafts for Jose to review. */
import type { Line } from "./rivals";

/** Something done in some run, ever. "good:<companion>" is that companion's good ending. */
export type Milestone = "firstRun" | "region1" | "runWon" | "nemesisSettled" | "spared" | "anyGood"
  | "good:remanso" | "good:guijo" | "good:centella" | "good:moheda" | "hardWon" | "sapTier" | "mended";

/** How a milestone reads when it is still locked. */
export const MILESTONE_HINT: Record<Milestone, Line> = {
  firstRun: { es: "Termina un viaje, como sea.", en: "Finish a journey, however it ends." },
  region1: { es: "Deja atrás el pueblo arrasado.", en: "Get past the Sap-ruined town." },
  runWon: { es: "Termina un viaje con victoria.", en: "Win a journey." },
  nemesisSettled: { es: "Acaba con una némesis o perdónala.", en: "Settle a nemesis: finish it or spare it." },
  spared: { es: "Perdona a un enemigo que se rinde.", en: "Spare a foe who yields." },
  anyGood: { es: "Lleva a un compañero a su final bueno.", en: "Bring a companion to their good ending." },
  "good:remanso": { es: "El final bueno de Remanso.", en: "Remanso's good ending." },
  "good:guijo": { es: "El final bueno de Guijo.", en: "Guijo's good ending." },
  "good:centella": { es: "El final bueno de Centella.", en: "Centella's good ending." },
  "good:moheda": { es: "El final bueno de Moheda.", en: "Moheda's good ending." },
  hardWon: { es: "Gana un viaje en Difícil.", en: "Win a journey on Hard." },
  sapTier: { es: "Gana un viaje en un nivel de Savia.", en: "Win a journey on a Sap tier." },
  mended: { es: "Perdona a un compañero que volvió como rival.", en: "Spare a companion who came back as a rival." },
};

export interface Kit {
  id: string;
  name: Line;
  desc: Line;
  /** Locked until this milestone; null for the one every hero has. */
  needs: Milestone | null;
  /** Items worn (or carried) from the start (data/gear.ts). */
  items?: string[];
  coins?: number;
  shards?: number;
}

export const KITS: Kit[] = [
  { id: "traveller", needs: null, name: { es: "Viajero", en: "Traveller" },
    desc: { es: "Solo lo puesto. Como la primera vez.", en: "Only what you wear. Like the first time." } },
  { id: "lamplighter", needs: "region1", coins: 20, name: { es: "Farolero", en: "Lamplighter" },
    desc: { es: "Unas monedas rescatadas del pueblo, para la primera tienda.", en: "A few coins saved from the town, for the first shop." } },
  { id: "scavenger", needs: "nemesisSettled", shards: 2, name: { es: "Carroñero", en: "Scavenger" },
    desc: { es: "Dos fragmentos de Savia arrancados de una marca vieja.", en: "Two Savia shards pried from an old mark." } },
  { id: "pilgrim", needs: "anyGood", items: ["tileVest"], name: { es: "Peregrino", en: "Pilgrim" },
    desc: { es: "El chaleco de tejas que alguien te regaló al despedirse.", en: "The tile vest someone gave you when you parted." } },
  { id: "veteran", needs: "runWon", items: ["featherCharm"], name: { es: "Veterano", en: "Veteran" },
    desc: { es: "La pluma ligera de tu viaje victorioso.", en: "The light feather from your winning journey." } },
  { id: "mender", needs: "mended", items: ["patchedCoat"], name: { es: "Remendón", en: "Mender" },
    desc: { es: "El abrigo que cosiste con quien volvió a tu lado.", en: "The coat you stitched with the one who came back to your side." } },
  { id: "survivor", needs: "hardWon", coins: 10, shards: 1, name: { es: "Superviviente", en: "Survivor" },
    desc: { es: "Lo que quedó en los bolsillos tras el camino difícil.", en: "What was left in your pockets after the hard road." } },
];

export interface LorePage { id: string; needs: Milestone; title: Line; text: Line }

export const LORE: LorePage[] = [
  { id: "sap", needs: "firstRun", title: { es: "La Savia", en: "The Sap" },
    text: { es: "Bajó por el río una primavera, dorada y espesa. Lo que toca no muere: se queda, y recuerda. Por eso los marcados vuelven.", en: "It came down the river one spring, golden and thick. What it touches doesn't die: it stays, and it remembers. That is why the marked come back." } },
  { id: "town", needs: "region1", title: { es: "El pueblo", en: "The town" },
    text: { es: "Antes tenía molinos, una cantera y una feria en otoño. Ahora tiene ecos. Los supervivientes subieron al embalse porque allí aún había agua limpia.", en: "It used to have mills, a quarry and an autumn fair. Now it has echoes. The survivors climbed to the reservoir because the water there was still clean." } },
  { id: "spared", needs: "spared", title: { es: "La bandera blanca", en: "The white flag" },
    text: { es: "No todos los marcados quieren pelear. Algunos solo tienen miedo de lo que la Savia les hace sentir. A esos, a veces, se les puede dejar ir.", en: "Not every marked creature wants to fight. Some are only afraid of what the Sap makes them feel. Those, sometimes, can be let go." } },
  { id: "nemesis", needs: "nemesisSettled", title: { es: "Marcas que recuerdan", en: "Marks that remember" },
    text: { es: "Una marca de Savia guarda cada golpe que recibió. Cuando por fin se rompe, deja fragmentos, y en los fragmentos todavía se oye la pelea.", en: "A Sap mark keeps every blow it took. When it finally breaks it leaves shards, and in the shards you can still hear the fight." } },
  { id: "mira", needs: "runWon", title: { es: "Mira", en: "Mira" },
    text: { es: "La guardiana del lago cuidaba el agua mucho antes del pueblo. La Savia la congeló por dentro. Dicen que, al caer, el hielo sonó como una campana.", en: "The lake's guardian watched the water long before there was a town. The Sap froze her from the inside. They say that when she fell, the ice rang like a bell." } },
  { id: "mill", needs: "good:remanso", title: { es: "El molino", en: "The mill" },
    text: { es: "Remanso aún pesca extraños en el río. Ahora les mira las manos antes de darles la suya.", en: "Remanso still fishes strangers out of the river. Now he checks their hands before he gives them his." } },
  { id: "wall", needs: "good:guijo", title: { es: "El muro de nombres", en: "The wall of names" },
    text: { es: "Cada mañana, un nombre nuevo en la piedra. Guijo no lo hace por tristeza. Lo hace para que nadie se quede atrás del todo.", en: "Every morning, a new name in the stone. Guijo doesn't do it out of sadness. He does it so nobody is left behind entirely." } },
  { id: "storm", needs: "good:centella", title: { es: "Mensajes en la tormenta", en: "Messages in the storm" },
    text: { es: "En el juncal dicen que, cuando truena, es Centella llevando una carta. Casi siempre llega antes que la lluvia.", en: "In the marsh they say that when it thunders, it's Centella carrying a letter. It nearly always arrives before the rain." } },
  { id: "garden", needs: "good:moheda", title: { es: "El huerto que no brilla", en: "The garden that doesn't glow" },
    text: { es: "Moheda olvidó la fórmula a propósito. A veces, de noche, la escribe en el aire con el dedo, y luego la borra.", en: "Moheda forgot the formula on purpose. Sometimes, at night, she writes it in the air with a finger, and then wipes it away." } },
  { id: "reservoir", needs: "hardWon", title: { es: "El embalse", en: "The reservoir" },
    text: { es: "Arriba, junto a la presa, los supervivientes cuentan a los que llegan. Nunca preguntan de dónde vienes, solo si traes a alguien contigo.", en: "Up by the dam, the survivors count whoever arrives. They never ask where you come from, only whether you bring someone with you." } },
  { id: "deep", needs: "sapTier", title: { es: "La Savia profunda", en: "The deep Sap" },
    text: { es: "Bajo el pueblo la Savia es más vieja y más espesa. No recuerda golpes: recuerda nombres. Y a veces los dice.", en: "Under the town the Sap is older and thicker. It doesn't remember blows: it remembers names. And sometimes it says them." } },
  { id: "home", needs: "mended", title: { es: "Volver", en: "Coming back" },
    text: { es: "La marca no se borra del todo. Pero quien vuelve sabe ahora lo que pesa, y camina un poco más cerca del fuego.", en: "The mark never quite fades. But whoever comes back knows its weight now, and walks a little closer to the fire." } },
];
