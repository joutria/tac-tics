/* Companions: who they are, what they value, and what they say (plan doc "Companion values and forbidden actions",
   gap 19: typed dialogue data with both languages side by side). Lines here are drafts for Jose to review.

   Remanso is the first recruit: a river otter of the Sap-ruined town, a local variant of Evolvlings' Remolín. He
   kept the flooded mill running for the survivors and patches up anyone who reaches it, friend or not. */
import type { UnitSpec } from "../engine/state";
import type { Line } from "./rivals";

/** What a companion reacts to in battle. */
export type Deed = "helpUp" | "heal" | "finishDowned" | "killFleeing" | "letEscape";

export interface Companion {
  id: string;
  spec: Omit<UnitSpec, "pos">;
  /** Approval change per deed. A forbidden deed is never forgotten and counts every time. */
  reacts: Partial<Record<Deed, number>>;
  /** Most approval one battle can add from liked deeds, so grinding heals does not buy loyalty. */
  likeCapPerBattle: number;
  forbidden: Deed[];
  /** One line per deed, said after the battle where it happened. */
  remarks: Partial<Record<Deed, Line>>;
  /** Said when approval first drops under each step of the escalation. */
  escalation: { cold: Line; refuses: Line; leaves: Line; betrays: Line };
  /** Shown as the warning on a forbidden target, once the player has heard about it. */
  forbiddenWarning: Line;
}

export const COMPANIONS: Record<string, Companion> = {
  remanso: {
    id: "remanso",
    spec: {
      id: "remanso", name: "Remanso", team: "heroes", element: "water", look: "remolin",
      hp: 40, ap: 6, mp: 3, speed: 48, jump: 1, str: 6, mag: 12, agi: 12, res: { water: 20 },
      abilities: ["splash", "undertow", "mend"],
    },
    reacts: { helpUp: 4, heal: 1, letEscape: 2, finishDowned: -5, killFleeing: -20 },
    likeCapPerBattle: 8,
    forbidden: ["killFleeing"],
    remarks: {
      helpUp: { es: "Remanso: «Así se hace. Nadie se queda en el suelo».", en: "Remanso: \"That's it. Nobody stays on the ground.\"" },
      heal: { es: "Remanso asiente mientras guarda las vendas.", en: "Remanso nods as he packs the bandages away." },
      letEscape: { es: "Remanso: «Que se vaya. Ya tiene bastante con la Savia».", en: "Remanso: \"Let it go. The Sap is punishment enough.\"" },
      finishDowned: { es: "Remanso: «Ya estaba en el suelo. No hacía falta».", en: "Remanso: \"It was already down. There was no need.\"" },
      killFleeing: { es: "Remanso: «Huía. ¡Huía y lo mataste por la espalda!»", en: "Remanso: \"It was running. It was running and you cut it down from behind!\"" },
    },
    escalation: {
      cold: { es: "Remanso apenas te habla durante la marcha.", en: "Remanso barely speaks to you on the road." },
      refuses: { es: "Remanso: «No pienso atacar a nadie que huya. Ni aunque me lo pidas».", en: "Remanso: \"I won't strike anyone who is running. Not even if you ask.\"" },
      leaves: { es: "Remanso recoge sus cosas junto al fuego. «Aquí se separan nuestros caminos».", en: "Remanso packs his things by the fire. \"This is where our roads part.\"" },
      betrays: { es: "Remanso se planta frente a ti. «La próxima vez, el que huya serás tú».", en: "Remanso stands in your way. \"Next time, you'll be the one running.\"" },
    },
    forbiddenWarning: { es: "Remanso no te perdonará esto", en: "Remanso won't forgive this" },
  },
};

/** Approval thresholds (plan doc): cold under 0, refuses some orders under -30, leaves under -60. */
export const APPROVAL = { start: 5, cold: 0, refuses: -30, leaves: -60, min: -100, max: 100 };

/** A conversation: lines, then choices that move approval, reveal a forbidden action, and recruit or not. */
export interface Talk {
  id: string;
  companion: string;
  lines: Line[];
  choices: { text: Line; reply: Line; approval: number; reveals?: boolean; joins: boolean }[];
}

export const TALKS: Record<string, Talk> = {
  "remanso.meet": {
    id: "remanso.meet",
    companion: "remanso",
    lines: [
      { es: "Entre los molinos inundados, una nutria remienda una red. A su alrededor duermen tres heridos del pueblo.", en: "Among the flooded mills, an otter mends a net. Three wounded townsfolk sleep around him." },
      { es: "Remanso: «Si vienes a saquear, aquí solo queda barro. Si vienes a ayudar… me vendrían bien unas patas más».", en: "Remanso: \"If you came to loot, there's only mud left. If you came to help… I could use another pair of paws.\"" },
      { es: "Remanso: «Iré contigo hasta el centro del pueblo. Pero escucha: a quien huye, se le deja huir. Eso no lo negocio».", en: "Remanso: \"I'll go with you to the heart of town. But listen: whoever runs, you let them run. That I won't bargain on.\"" },
    ],
    choices: [
      { text: { es: "«Trato hecho. Nadie que huya.»", en: "\"Deal. Nobody who runs.\"" }, reply: { es: "Remanso: «Bien. Coge esa red, nos vamos».", en: "Remanso: \"Good. Grab that net, we're going.\"" }, approval: 10, reveals: true, joins: true },
      { text: { es: "«Lo que huye vuelve con más fuerza. Ya veremos.»", en: "\"What runs comes back stronger. We'll see.\"" }, reply: { es: "Remanso: «Entonces te vigilaré de cerca».", en: "Remanso: \"Then I'll be watching you closely.\"" }, approval: -10, reveals: true, joins: true },
      { text: { es: "«Mejor quédate con tus heridos.»", en: "\"Better stay with your wounded.\"" }, reply: { es: "Remanso: «Como quieras. El molino seguirá aquí».", en: "Remanso: \"Suit yourself. The mill will still be here.\"" }, approval: 0, joins: false },
    ],
  },
};
