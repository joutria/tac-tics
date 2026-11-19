/* Companions: who they are, what they value, and what they say (plan doc "Companion values and forbidden actions",
   gap 19: typed dialogue data with both languages side by side). Lines here are drafts for Jose to review.

   Remanso is the first recruit: a river otter of the Sap-ruined town, a local variant of Evolvlings' Remolín. He
   kept the flooded mill running for the survivors and patches up anyone who reaches it, friend or not. */
import type { UnitSpec } from "../engine/state";
import type { Line } from "./rivals";

/** What a companion reacts to. Most are read from a battle's log; the last three happen on the run map. */
export type Deed =
  | "helpUp" | "heal" | "finishDowned" | "killFleeing" | "letEscape"
  /** A companion bled out on the ground: nobody helped them up in time. */
  | "allyBledOut"
  /** A battle won with nobody in the party ever downed. */
  | "noneDowned"
  | "rivalBeaten" | "rivalEscaped"
  /** A battle won within QUICK_WIN_ROUNDS rounds. */
  | "quickWin"
  | "shardsGained" | "spendShards"
  /** Savia shards burned at a rest's cleansing fire. */
  | "destroyShards";

export const DEEDS: Deed[] = ["helpUp", "heal", "finishDowned", "killFleeing", "letEscape", "allyBledOut", "noneDowned",
  "rivalBeaten", "rivalEscaped", "quickWin", "shardsGained", "spendShards", "destroyShards"];

export const QUICK_WIN_ROUNDS = 4;

export interface Companion {
  id: string;
  spec: Omit<UnitSpec, "pos">;
  /** Approval change per deed. A forbidden deed is never forgotten and counts every time. */
  reacts: Partial<Record<Deed, number>>;
  /** Most approval one battle can add from liked deeds, so grinding heals does not buy loyalty. */
  likeCapPerBattle: number;
  forbidden: Deed[];
  /** Dislikes that clash with another companion's values. They sour the mood but stop at APPROVAL.clashFloor, so
      two companions who want opposite things can both stay (Jose's note on Centella and Remanso). */
  soft?: Deed[];
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
    reacts: { helpUp: 4, heal: 1, letEscape: 2, finishDowned: -5, allyBledOut: -5, killFleeing: -20 },
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

  /* Guijo: a pebble creature from the quarry by the town, a local variant of Evolvlings' Pebb. He carried people
     out of the collapsed houses for three days and has not slept since. Joins in the town. */
  guijo: {
    id: "guijo",
    spec: {
      id: "guijo", name: "Guijo", team: "heroes", element: "stone", look: "guijo",
      hp: 54, ap: 6, mp: 2, speed: 36, jump: 1, str: 11, mag: 4, agi: 6, res: { stone: 25, fire: 10, bolt: 10 },
      abilities: ["slam", "bulwark", "tremor"],
    },
    reacts: { helpUp: 4, noneDowned: 3, heal: 1, allyBledOut: -25 },
    likeCapPerBattle: 8,
    forbidden: ["allyBledOut"],
    remarks: {
      helpUp: { es: "Guijo: «Arriba. He cargado cosas más pesadas».", en: "Guijo: \"Up you get. I've carried heavier.\"" },
      noneDowned: { es: "Guijo cuenta a todos con un dedo de piedra. No falta nadie.", en: "Guijo counts everyone with a stone finger. Nobody is missing." },
      heal: { es: "Guijo deja de vigilar la retaguardia un momento y respira.", en: "Guijo stops watching the rear for a moment and breathes." },
      allyBledOut: { es: "Guijo: «Estaba ahí. Estaba ahí y nadie fue».", en: "Guijo: \"They were right there. Right there, and nobody went.\"" },
    },
    escalation: {
      cold: { es: "Guijo: «Llevo la cuenta de a quién dejamos atrás. Deberías llevarla tú también».", en: "Guijo: \"I keep count of who we leave behind. You should too.\"" },
      refuses: { es: "Guijo ya no espera tus órdenes para ir hacia los heridos.", en: "Guijo no longer waits for your orders to go to the wounded." },
      leaves: { es: "Guijo se echa al hombro su saco de piedras. «Hay gente en los túneles que todavía me necesita».", en: "Guijo shoulders his sack of stones. \"There are people in the tunnels who still need me.\"" },
      betrays: { es: "Guijo bloquea el camino con su cuerpo. «Tú no vas a dejar a nadie más en el suelo».", en: "Guijo blocks the road with his body. \"You won't leave anyone else on the ground.\"" },
    },
    forbiddenWarning: { es: "Guijo no perdona que se deje morir a un aliado", en: "Guijo won't forgive letting an ally die" },
  },

  /* Centella: a lightning fox of the storm marsh, a grown Relampín. A Sap-marked foe burned her den and she has
     hunted it since. Her grudge against sparing rivals is soft: it sours her mood but never drives her out, so a
     party can keep both her and Remanso. Joins at the Broken Reservoir. */
  centella: {
    id: "centella",
    spec: {
      id: "centella", name: "Centella", team: "heroes", element: "bolt", look: "centella",
      hp: 32, ap: 6, mp: 4, speed: 58, jump: 2, str: 9, mag: 11, agi: 16, res: { bolt: 25 },
      abilities: ["spark", "jolt", "dash"],
    },
    reacts: { rivalBeaten: 5, killFleeing: 3, quickWin: 2, finishDowned: 1, letEscape: -3, rivalEscaped: -8 },
    likeCapPerBattle: 10,
    forbidden: [],
    soft: ["letEscape", "rivalEscaped"],
    remarks: {
      rivalBeaten: { es: "Centella: «Uno menos. Así se cierra una cuenta».", en: "Centella: \"One less. That's how you settle a debt.\"" },
      killFleeing: { es: "Centella sacude las chispas de la cola. «No iba a llegar lejos».", en: "Centella shakes the sparks off her tail. \"It wasn't getting far.\"" },
      quickWin: { es: "Centella: «Eres rápido para ser alguien que brilla. Me gusta».", en: "Centella: \"You're fast for someone who glows. I like that.\"" },
      finishDowned: { es: "Centella asiente. «Lo que se empieza, se termina».", en: "Centella nods. \"What you start, you finish.\"" },
      letEscape: { es: "Centella mira hacia donde se fue. «Volverá. Siempre vuelven».", en: "Centella stares where it went. \"It'll be back. They always come back.\"" },
      rivalEscaped: { es: "Centella: «Lo teníamos. Lo teníamos y lo dejaste ir».", en: "Centella: \"We had it. We had it and you let it walk.\"" },
    },
    escalation: {
      cold: { es: "Centella camina por delante, sin esperar a nadie.", en: "Centella walks ahead, waiting for no one." },
      refuses: { es: "Centella: «Haz lo que quieras. Yo iré a por los que huyen».", en: "Centella: \"Do what you like. I'll go after the ones that run.\"" },
      leaves: { es: "Centella ya no está junto al fuego por la mañana. Solo quedan huellas chamuscadas.", en: "Centella is gone from the fire by morning. Only scorched tracks remain." },
      betrays: { es: "Centella te enseña los dientes entre chispas. «Tú eres el siguiente de mi lista».", en: "Centella bares her teeth through the sparks. \"You're next on my list.\"" },
    },
    forbiddenWarning: { es: "Centella no quiere dejar ir a un rival", en: "Centella hates letting a rival go" },
  },

  /* Moheda: a mushroom creature of the flooded pump houses, a grown Capuchón. She studies the Savia instead of
     fearing it, and heals with it. Morally grey on purpose. Joins at the Broken Reservoir. */
  moheda: {
    id: "moheda",
    spec: {
      id: "moheda", name: "Moheda", team: "heroes", element: "mush", look: "moheda",
      hp: 38, ap: 6, mp: 3, speed: 44, jump: 1, str: 3, mag: 15, agi: 9, res: { mush: 25, plant: 10 },
      abilities: ["spores", "wilt", "sapCap"],
    },
    reacts: { shardsGained: 2, heal: 1, rivalEscaped: 2, spendShards: -3, destroyShards: -20 },
    likeCapPerBattle: 6,
    forbidden: ["destroyShards"],
    remarks: {
      shardsGained: { es: "Moheda guarda el fragmento en un frasco y lo etiqueta con cuidado.", en: "Moheda puts the shard in a jar and labels it carefully." },
      heal: { es: "Moheda: «Quieto. Esto sabe fatal y me lo vas a agradecer».", en: "Moheda: \"Hold still. This will taste awful, and you will thank me.\"" },
      rivalEscaped: { es: "Moheda toma notas sobre cómo huía. «Fascinante. Vuelve más fuerte cada vez».", en: "Moheda takes notes on how it fled. \"Fascinating. It comes back stronger every time.\"" },
      spendShards: { es: "Moheda: «¿Lo cambiaste por una baratija? Eso era una página que no leeré nunca».", en: "Moheda: \"You traded it for a trinket? That was a page I'll never read.\"" },
      destroyShards: { es: "Moheda mira el fuego tragarse los fragmentos. «Acabas de quemar las pruebas».", en: "Moheda watches the fire swallow the shards. \"You just burned the evidence.\"" },
    },
    escalation: {
      cold: { es: "Moheda escribe en su cuaderno y no te deja leerlo.", en: "Moheda writes in her notebook and won't let you read it." },
      refuses: { es: "Moheda ya no comparte sus remedios contigo. Solo con los demás.", en: "Moheda no longer shares her remedies with you. Only with the others." },
      leaves: { es: "Moheda se lleva sus frascos antes del alba. Su sitio junto al fuego huele a tierra mojada.", en: "Moheda takes her jars before dawn. Her place by the fire smells of wet earth." },
      betrays: { es: "Moheda descorcha un frasco que brilla. «Veamos qué te hace la Savia a ti».", en: "Moheda uncorks a jar that glows. \"Let's see what the Sap does to you.\"" },
    },
    forbiddenWarning: { es: "Moheda no perdonará que quemes los fragmentos", en: "Moheda won't forgive burning the shards" },
  },
};

/** Approval thresholds (plan doc): cold under 0, refuses some orders under -30, leaves under -60. */
export const APPROVAL = { start: 5, cold: 0, clashFloor: -15, refuses: -30, leaves: -60, min: -100, max: 100 };

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

  "guijo.meet": {
    id: "guijo.meet",
    companion: "guijo",
    lines: [
      { es: "Junto a la cantera, una criatura de piedra levanta una viga caída. Debajo hay un niño, vivo.", en: "By the quarry, a stone creature lifts a fallen beam. Under it is a child, alive." },
      { es: "Guijo: «Tres días sacando gente de las casas. No he dormido. Si vas al centro del pueblo, voy contigo».", en: "Guijo: \"Three days pulling people out of the houses. I haven't slept. If you're going to the heart of town, I'm coming.\"" },
      { es: "Guijo: «Una cosa. Si alguien cae, se le levanta. No dejo a nadie en el suelo. Nunca».", en: "Guijo: \"One thing. If someone falls, we pick them up. I leave nobody on the ground. Ever.\"" },
    ],
    choices: [
      { text: { es: "«Nadie se queda atrás. Lo prometo.»", en: "\"Nobody gets left behind. I promise.\"" }, reply: { es: "Guijo: «Bien. Yo iré delante. Tú no me pierdas de vista».", en: "Guijo: \"Good. I'll go in front. Don't lose sight of me.\"" }, approval: 10, reveals: true, joins: true },
      { text: { es: "«A veces hay que seguir sin mirar atrás.»", en: "\"Sometimes you have to keep going without looking back.\"" }, reply: { es: "Guijo: «Eso dicen los que nunca han cargado a nadie. Iré igual, para que no lo hagas».", en: "Guijo: \"That's what people say who've never carried anyone. I'll come anyway, so you don't.\"" }, approval: -10, reveals: true, joins: true },
      { text: { es: "«Descansa. El pueblo te necesita aquí.»", en: "\"Rest. The town needs you here.\"" }, reply: { es: "Guijo: «Descansar. Sí. Puede que mañana».", en: "Guijo: \"Rest. Yes. Maybe tomorrow.\"" }, approval: 0, joins: false },
    ],
  },
  "centella.meet": {
    id: "centella.meet",
    companion: "centella",
    lines: [
      { es: "Un relámpago cae en el juncal y no se apaga: es una zorra eléctrica, olfateando unas huellas doradas.", en: "Lightning strikes the reeds and doesn't fade: it's a storm fox, sniffing at golden tracks." },
      { es: "Centella: «Algo marcado por la Savia quemó mi madriguera. Le sigo el rastro desde entonces. Vosotros también lo cazáis, ¿no?»", en: "Centella: \"Something Sap-marked burned my den. I've followed its trail ever since. You hunt them too, don't you?\"" },
      { es: "Centella: «Me uno si vamos rápido. Y si un rival cae en nuestras manos, no se le deja ir».", en: "Centella: \"I'll join if we move fast. And if a rival falls into our hands, it doesn't walk away.\"" },
    ],
    choices: [
      { text: { es: "«Ninguno se escapará.»", en: "\"None of them will get away.\"" }, reply: { es: "Centella: «Eso quería oír. Intenta seguirme el ritmo».", en: "Centella: \"That's what I wanted to hear. Try to keep up.\"" }, approval: 10, reveals: true, joins: true },
      { text: { es: "«Algunos se pueden salvar. Ya veremos cuáles.»", en: "\"Some can be saved. We'll see which.\"" }, reply: { es: "Centella: «Salvar… Ya veremos, sí. Pero no me pidas que mire».", en: "Centella: \"Saved… We'll see, yes. But don't ask me to watch.\"" }, approval: -5, reveals: true, joins: true },
      { text: { es: "«Caza sola. Nosotros vamos a otro ritmo.»", en: "\"Hunt alone. We go at another pace.\"" }, reply: { es: "Centella: «Tú te lo pierdes». Y ya no está.", en: "Centella: \"Your loss.\" And she's gone." }, approval: 0, joins: false },
    ],
  },
  "moheda.meet": {
    id: "moheda.meet",
    companion: "moheda",
    lines: [
      { es: "En la casa de bombas inundada, una seta con gafas sostiene un frasco que brilla. Está tomando notas.", en: "In a flooded pump house, a mushroom in spectacles holds up a glowing jar. She's taking notes." },
      { es: "Moheda: «No me mires así. La Savia no es buena ni mala. Es un dato. Y yo curo con datos».", en: "Moheda: \"Don't look at me like that. The Sap isn't good or bad. It's evidence. And I heal with evidence.\"" },
      { es: "Moheda: «Iré con vosotros. A cambio, los fragmentos que encontréis se guardan. Quemarlos es quemar la cura».", en: "Moheda: \"I'll come with you. In return, the shards you find are kept. Burning them is burning the cure.\"" },
    ],
    choices: [
      { text: { es: "«Guardaremos los fragmentos.»", en: "\"We'll keep the shards.\"" }, reply: { es: "Moheda: «Sensato. Nos vamos a llevar bien. Casi siempre».", en: "Moheda: \"Sensible. We will get along. Mostly.\"" }, approval: 10, reveals: true, joins: true },
      { text: { es: "«La Savia arrasó el pueblo. No prometo nada.»", en: "\"The Sap razed the town. I promise nothing.\"" }, reply: { es: "Moheda: «Honesto. Entonces tomaré notas sobre ti también».", en: "Moheda: \"Honest. Then I'll take notes on you too.\"" }, approval: -10, reveals: true, joins: true },
      { text: { es: "«Sigue con tus frascos.»", en: "\"Stay with your jars.\"" }, reply: { es: "Moheda: «Lo haré. Ellos no discuten».", en: "Moheda: \"I will. They don't argue.\"" }, approval: 0, joins: false },
    ],
  },
};
