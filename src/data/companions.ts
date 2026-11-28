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
  | "destroyShards"
  /** Moheda's Sap Cap used on another companion (her "seen it" moment; nobody reacts to it). */
  | "sapRemedy"
  /** The hero took the Beacon or the Blaze job. */
  | "jobBeacon" | "jobBlaze"
  /** A yielding or downed foe spared (in the fight, or after the win). */
  | "spare"
  /** A yielding foe downed or killed anyway, or finished after the win. */
  | "finishYielding";

export const DEEDS: Deed[] = ["helpUp", "heal", "finishDowned", "killFleeing", "letEscape", "allyBledOut", "noneDowned",
  "rivalBeaten", "rivalEscaped", "quickWin", "shardsGained", "spendShards", "destroyShards", "sapRemedy", "jobBeacon", "jobBlaze", "spare", "finishYielding"];

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
      hp: 50, ap: 6, mp: 3, speed: 48, jump: 1, str: 6, mag: 12, agi: 12, res: { water: 20 },
      abilities: ["splash", "undertow", "mend"], quick: "douse",
    },
    reacts: { helpUp: 4, heal: 1, letEscape: 2, jobBeacon: 5, spare: 4, finishDowned: -5, finishYielding: -4, allyBledOut: -5, killFleeing: -20 },
    likeCapPerBattle: 8,
    forbidden: ["killFleeing"],
    remarks: {
      helpUp: { es: "Remanso: «Así se hace. Nadie se queda en el suelo».", en: "Remanso: \"That's it. Nobody stays on the ground.\"" },
      heal: { es: "Remanso asiente mientras guarda las vendas.", en: "Remanso nods as he packs the bandages away." },
      letEscape: { es: "Remanso: «Que se vaya. Ya tiene bastante con la Savia».", en: "Remanso: \"Let it go. The Sap is punishment enough.\"" },
      jobBeacon: { es: "Remanso sonríe. «Un faro. Eso es lo que necesitaba este valle».", en: "Remanso smiles. \"A beacon. That's what this valley needed.\"" },
      finishDowned: { es: "Remanso: «Ya estaba en el suelo. No hacía falta».", en: "Remanso: \"It was already down. There was no need.\"" },
      killFleeing: { es: "Remanso: «Huía. ¡Huía y lo mataste por la espalda!»", en: "Remanso: \"It was running. It was running and you cut it down from behind!\"" },
      spare: { es: "Remanso: «Bien. Que vuelva a casa y se lo cuente a los suyos».", en: "Remanso: \"Good. Let it go home and tell its own.\"" },
      finishYielding: { es: "Remanso: «Tenía la bandera alzada. La viste».", en: "Remanso: \"It had the flag up. You saw it.\"" },
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
      hp: 66, ap: 6, mp: 2, mana: 16, speed: 36, jump: 1, str: 11, mag: 4, agi: 6, res: { stone: 25, fire: 10, bolt: 10 },
      abilities: ["slam", "bulwark", "tremor"], quick: "hurl",
    },
    reacts: { helpUp: 4, noneDowned: 3, heal: 1, jobBeacon: 5, spare: 1, allyBledOut: -25 },
    likeCapPerBattle: 8,
    forbidden: ["allyBledOut"],
    remarks: {
      helpUp: { es: "Guijo: «Arriba. He cargado cosas más pesadas».", en: "Guijo: \"Up you get. I've carried heavier.\"" },
      noneDowned: { es: "Guijo cuenta a todos con un dedo de piedra. No falta nadie.", en: "Guijo counts everyone with a stone finger. Nobody is missing." },
      jobBeacon: { es: "Guijo asiente despacio. «Tú delante con la luz. Yo detrás con la piedra».", en: "Guijo nods slowly. \"You in front with the light. Me behind with the stone.\"" },
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
      hp: 40, ap: 6, mp: 4, mana: 18, speed: 58, jump: 2, str: 9, mag: 11, agi: 16, res: { bolt: 25 },
      abilities: ["spark", "jolt", "dash"], quick: "zip",
    },
    reacts: { rivalBeaten: 5, killFleeing: 3, quickWin: 2, finishDowned: 1, finishYielding: 1, jobBlaze: 5, letEscape: -3, rivalEscaped: -8, spare: -1 },
    likeCapPerBattle: 10,
    forbidden: [],
    soft: ["letEscape", "rivalEscaped", "spare"],
    remarks: {
      rivalBeaten: { es: "Centella: «Uno menos. Así se cierra una cuenta».", en: "Centella: \"One less. That's how you settle a debt.\"" },
      killFleeing: { es: "Centella sacude las chispas de la cola. «No iba a llegar lejos».", en: "Centella shakes the sparks off her tail. \"It wasn't getting far.\"" },
      quickWin: { es: "Centella: «Eres rápido para ser alguien que brilla. Me gusta».", en: "Centella: \"You're fast for someone who glows. I like that.\"" },
      jobBlaze: { es: "Centella enseña los dientes, contenta. «Ahora sí quemas».", en: "Centella bares her teeth, pleased. \"Now you actually burn.\"" },
      finishDowned: { es: "Centella asiente. «Lo que se empieza, se termina».", en: "Centella nods. \"What you start, you finish.\"" },
      letEscape: { es: "Centella mira hacia donde se fue. «Volverá. Siempre vuelven».", en: "Centella stares where it went. \"It'll be back. They always come back.\"" },
      rivalEscaped: { es: "Centella: «Lo teníamos. Lo teníamos y lo dejaste ir».", en: "Centella: \"We had it. We had it and you let it walk.\"" },
      spare: { es: "Centella resopla. «Bandera blanca. Ya veremos cuánto le dura».", en: "Centella snorts. \"White flag. We'll see how long that lasts.\"" },
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
      hp: 48, ap: 6, mp: 3, mana: 26, speed: 44, jump: 1, str: 3, mag: 15, agi: 9, res: { mush: 25, plant: 10 },
      abilities: ["spores", "wilt", "sapCap"], quick: "puff",
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

  /* Crossover characters from Evolvlings (data/crossover.ts), opened at the camp by late milestones.
     Tila: the lamplighter of the Dim Quarter, who stole oil to light the streets for everyone, and never asked who
     paid for the light that was missing. She hates seeing a light put out. */
  tila: {
    id: "tila",
    spec: {
      id: "tila", name: "Tila", team: "heroes", element: "light", look: "tila",
      hp: 42, ap: 6, mp: 4, mana: 20, speed: 54, jump: 2, str: 6, mag: 12, agi: 16, res: { light: 20, shadow: 10 },
      abilities: ["lantern", "oilFlask", "lastLantern"], quick: "zip",
    },
    reacts: { spare: 4, helpUp: 3, heal: 1, spendShards: 2, noneDowned: 2, finishDowned: -3, finishYielding: -20 },
    likeCapPerBattle: 8,
    forbidden: ["finishYielding"],
    remarks: {
      spare: { es: "Tila: «Eso es. Que se lleve su farol a casa».", en: "Tila: \"That's it. Let it carry its lantern home.\"" },
      helpUp: { es: "Tila sopla sobre la mecha de su farol, como si así ayudara a levantarse.", en: "Tila blows on her lantern's wick, as if that helps someone stand." },
      heal: { es: "Tila reparte lo que queda de aceite entre las vendas. No se guarda nada.", en: "Tila shares out what's left of the oil among the bandages. She keeps nothing back." },
      spendShards: { es: "Tila: «Bien. Lo que brilla es para gastarlo, no para guardarlo en un frasco».", en: "Tila: \"Good. What shines is for spending, not for keeping in a jar.\"" },
      noneDowned: { es: "Tila cuenta las luces del grupo con el dedo. Están todas encendidas.", en: "Tila counts the party's lights with a finger. They're all still lit." },
      finishDowned: { es: "Tila aparta la vista. «Ya estaba apagado».", en: "Tila looks away. \"It had already gone out.\"" },
      finishYielding: { es: "Tila: «Tenía la bandera en alto. Era su último farol, y lo soplaste».", en: "Tila: \"Its flag was up. That was its last lantern, and you blew it out.\"" },
    },
    escalation: {
      cold: { es: "Tila camina al final del grupo y no enciende su farol.", en: "Tila walks at the back of the group and doesn't light her lantern." },
      refuses: { es: "Tila: «No pienso apagar a nadie que se rinde. Ni aunque me lo pidas».", en: "Tila: \"I won't put out anyone who yields. Not even if you ask.\"" },
      leaves: { es: "Por la mañana, el farol de Tila no está. Solo un rastro de gotas brillantes hacia el norte.", en: "By morning Tila's lantern is gone. Only a trail of glowing drops leading north." },
      betrays: { es: "Tila alza su farol entre tú y el camino. «En mi barrio, a los que apagan luces se les echa».", en: "Tila raises her lantern between you and the road. \"In my quarter, people who put out lights get thrown out.\"" },
    },
    forbiddenWarning: { es: "Tila no perdonará que remates a quien se rinde", en: "Tila won't forgive finishing someone who yields" },
  },

  /* Nim: the boy from the night side who dug under the Albor fence and draws maps of everything "so nothing gets
     lost". He believes everyone should be free to cross. */
  nim: {
    id: "nim",
    spec: {
      id: "nim", name: "Nim", team: "heroes", element: "shadow", look: "nim",
      hp: 40, ap: 6, mp: 4, mana: 18, speed: 56, jump: 2, str: 10, mag: 4, agi: 18, res: { shadow: 25 },
      abilities: ["nightCut", "shadowStep", "charcoal"], quick: "puff",
    },
    reacts: { noneDowned: 4, letEscape: 3, helpUp: 2, spare: 2, allyBledOut: -8, killFleeing: -20 },
    likeCapPerBattle: 8,
    forbidden: ["killFleeing"],
    remarks: {
      noneDowned: { es: "Nim dibuja a todo el grupo en una piedra. No falta nadie en el mapa.", en: "Nim draws the whole party on a stone. Nobody is missing from the map." },
      letEscape: { es: "Nim marca en su mapa por dónde se fue. «Sabe salir. Eso también hay que apuntarlo».", en: "Nim marks on his map where it went. \"It knows the way out. That's worth writing down too.\"" },
      helpUp: { es: "Nim: «Bien. Te había dibujado de pie. Tenía que seguir siendo verdad».", en: "Nim: \"Good. I'd drawn you standing. It had to stay true.\"" },
      spare: { es: "Nim no dice nada, pero borra la cruz que había puesto en su mapa.", en: "Nim says nothing, but rubs out the cross he'd put on his map." },
      allyBledOut: { es: "Nim mira su mapa mucho rato. Luego tacha un nombre.", en: "Nim stares at his map for a long time. Then he crosses out a name." },
      killFleeing: { es: "Nim: «Ya estaba cruzando. Lo tenía dibujado al otro lado».", en: "Nim: \"It was already crossing. I'd drawn it on the other side.\"" },
    },
    escalation: {
      cold: { es: "Nim deja de enseñarte sus mapas.", en: "Nim stops showing you his maps." },
      refuses: { es: "Nim: «A los que huyen no los toco. Ese camino ya es suyo».", en: "Nim: \"I won't touch the ones who run. That road is theirs now.\"" },
      leaves: { es: "Nim deja un mapa junto al fuego, con vuestro camino dibujado. Él ya no sale en él.", en: "Nim leaves a map by the fire with your road drawn on it. He isn't on it anymore." },
      betrays: { es: "Nim te cierra el paso con una sonrisa torcida. «Conozco todos los atajos. Tú no».", en: "Nim blocks your way with a crooked smile. \"I know every shortcut. You don't.\"" },
    },
    forbiddenWarning: { es: "Nim no perdonará que caces a quien huye", en: "Nim won't forgive cutting down someone running away" },
  },

  /* Unísona: the Star story creature, born when Tila and Nim sang their peoples' lullabies at once on the Ford. She
     only comes along while both of them travel with the party. */
  unisona: {
    id: "unisona",
    spec: {
      id: "unisona", name: "Unísona", team: "heroes", element: "star", look: "unisona",
      hp: 46, ap: 6, mp: 3, mana: 22, speed: 48, jump: 1, str: 4, mag: 12, agi: 12, res: { light: 10, shadow: 10 },
      abilities: ["firstNote", "duet", "unison"],
    },
    reacts: { helpUp: 3, heal: 2, spare: 2, noneDowned: 2, finishDowned: -3, allyBledOut: -6 },
    likeCapPerBattle: 7,
    forbidden: [],
    remarks: {
      helpUp: { es: "Unísona tararea dos notas y quien estaba en el suelo las sigue hasta ponerse en pie.", en: "Unísona hums two notes, and whoever was on the ground follows them back up." },
      heal: { es: "Unísona canta bajito mientras curan las heridas.", en: "Unísona sings softly while the wounds are tended." },
      spare: { es: "Unísona canta un trozo de nana al que se va. Se aleja más tranquilo.", en: "Unísona sings a scrap of lullaby to the one leaving. It goes calmer." },
      noneDowned: { es: "Unísona da una vuelta alrededor del grupo, contando voces. Están todas.", en: "Unísona circles the party, counting voices. They're all there." },
      finishDowned: { es: "Unísona deja de cantar un rato.", en: "Unísona stops singing for a while." },
      allyBledOut: { es: "Unísona canta una sola nota, muy larga, hasta que se le acaba el aire.", en: "Unísona sings a single note, very long, until she runs out of air." },
    },
    escalation: {
      cold: { es: "Unísona canta solo cuando Tila y Nim están cerca.", en: "Unísona only sings when Tila and Nim are close." },
      refuses: { es: "Unísona se esconde detrás de Tila cuando le pides algo.", en: "Unísona hides behind Tila when you ask her for anything." },
      leaves: { es: "Unísona se va de noche. A lo lejos se oye media nana.", en: "Unísona leaves in the night. Half a lullaby carries from far away." },
      betrays: { es: "Unísona canta una nota que duele en los dientes.", en: "Unísona sings a note that hurts your teeth." },
    },
    forbiddenWarning: { es: "Unísona dejará de cantar", en: "Unísona will stop singing" },
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
  "tila.meet": {
    id: "tila.meet",
    companion: "tila",
    lines: [
      { es: "En una calle del pueblo donde no queda nadie, un farol está encendido. Debajo, una muchacha con una aceitera abrazada mira la llama.", en: "In a street of the town where nobody is left, one lantern is lit. Under it, a young woman hugging an oil can watches the flame." },
      { es: "Tila: «Vi esta luz desde el valle y bajé. Pensé que alguien la había encendido para que lo encontraran. Pero aquí no hay nadie».", en: "Tila: \"I saw this light from the valley and came down. I thought someone lit it so they'd be found. But there's nobody here.\"" },
      { es: "Tila: «Iré contigo. Pero una cosa: a quien alza la bandera blanca no se le apaga. Ni aunque esté marcado».", en: "Tila: \"I'll come with you. But one thing: whoever raises the white flag doesn't get put out. Not even if they're marked.\"" },
    ],
    choices: [
      { text: { es: "«Nadie que se rinda. Te lo prometo.»", en: "\"Nobody who yields. I promise.\"" }, reply: { es: "Tila sonríe y enciende un segundo farol con el primero. «Entonces somos dos luces».", en: "Tila smiles and lights a second lantern from the first. \"Then we're two lights.\"" }, approval: 10, reveals: true, joins: true },
      { text: { es: "«Aquí la Savia engaña. No prometo nada.»", en: "\"The Sap lies here. I promise nothing.\"" }, reply: { es: "Tila: «Ya. Eso decían en Albor de los ladrones. Iré igual, para vigilarte».", en: "Tila: \"Sure. That's what they said about thieves in Albor. I'll come anyway, to keep an eye on you.\"" }, approval: -10, reveals: true, joins: true },
      { text: { es: "«Vuelve a tu barrio. Allí te necesitan.»", en: "\"Go back to your quarter. They need you there.\"" }, reply: { es: "Tila: «Puede. Pero esta luz se queda encendida». Y se queda con ella.", en: "Tila: \"Maybe. But this light stays lit.\" And she stays with it." }, approval: 0, joins: false },
    ],
  },
  "nim.meet": {
    id: "nim.meet",
    companion: "nim",
    lines: [
      { es: "Sobre la presa, un chico con los codos rotos dibuja con carbón en una piedra plana. Ha dibujado el embalse entero, y a ti llegando.", en: "On top of the dam, a boy with torn elbows draws with charcoal on a flat stone. He has drawn the whole reservoir, and you arriving." },
      { es: "Nim: «Tú. Sales en el mapa desde hace un rato. Si dibujo algo, no se pierde».", en: "Nim: \"You. You've been on the map for a while. If I draw something, it doesn't get lost.\"" },
      { es: "Nim: «Voy contigo, si quieres. Pero a los que huyen se les deja cruzar. Todo el mundo tiene derecho a una salida».", en: "Nim: \"I'll come, if you want. But the ones who run get to cross. Everyone has a right to a way out.\"" },
    ],
    choices: [
      { text: { es: "«Que crucen. Tú dibújalos al otro lado.»", en: "\"Let them cross. You draw them on the other side.\"" }, reply: { es: "Nim guarda la piedra bajo la chaqueta. «Vale. Te dibujo a ti también»", en: "Nim tucks the stone under his jacket. \"Fine. I'll draw you too.\"" }, approval: 10, reveals: true, joins: true },
      { text: { es: "«El que huye vuelve con más fuerza.»", en: "\"Whoever runs comes back stronger.\"" }, reply: { es: "Nim: «Eso decía el guarda de la verja». Viene igual, sin mirarte.", en: "Nim: \"That's what the gate warden used to say.\" He comes anyway, without looking at you." }, approval: -10, reveals: true, joins: true },
      { text: { es: "«Termina tu mapa.»", en: "\"Finish your map.\"" }, reply: { es: "Nim: «Siempre lo termino». Y vuelve a dibujar.", en: "Nim: \"I always do.\" And he goes back to drawing." }, approval: 0, joins: false },
    ],
  },
  "unisona.meet": {
    id: "unisona.meet",
    companion: "unisona",
    lines: [
      { es: "En la orilla, Tila canta una nana del lado del día y Nim, sin querer, la del lado de la noche. Las dos notas se encuentran.", en: "On the shore, Tila sings a lullaby from the day side and Nim, without meaning to, the one from the night side. The two notes meet." },
      { es: "Una criatura pequeña sale del agua, brillando como una estrella. Tila y Nim se miran: la conocen.", en: "A small creature climbs out of the water, shining like a star. Tila and Nim look at each other: they know her." },
      { es: "Unísona tararea las dos canciones a la vez y se queda mirándote, esperando.", en: "Unísona hums both songs at once and stays looking at you, waiting." },
    ],
    choices: [
      { text: { es: "«Ven. Cantaremos todos.»", en: "\"Come. We'll all sing.\"" }, reply: { es: "Unísona se sube al hombro de Tila y le tira del pelo a Nim. Ya es del grupo.", en: "Unísona climbs onto Tila's shoulder and tugs Nim's hair. She's part of the party now." }, approval: 10, joins: true },
      { text: { es: "«Este camino no es para cantar.»", en: "\"This road isn't one for singing.\"" }, reply: { es: "Unísona os sigue igual, a unos pasos, en silencio.", en: "Unísona follows anyway, a few steps behind, silent." }, approval: -10, joins: true },
      { text: { es: "«Quédate en el agua. Aquí estás a salvo.»", en: "\"Stay in the water. You're safe here.\"" }, reply: { es: "Unísona se hunde despacio, cantando, hasta que solo queda la luz.", en: "Unísona sinks slowly, singing, until only the light is left." }, approval: 0, joins: false },
    ],
  },
};

/* Personal quests and endings (M3 draft, "Endings"). Every recruit's flaw comes from their main value, and their
   quest holds a lesson moment that tests it. The good ending needs them to give up what that value holds on to;
   they can only do it once they are ready: approval LESSON_APPROVAL or more, and having seen what the flaw costs. */

/** Approval a companion needs to be ready for their lesson. */
export const LESSON_APPROVAL = 25;

/** "alt": the alternative good path (M3 draft, "Alternative good"), when the usual lesson can't happen. */
export type Lesson = "sacrifice" | "hold" | "double" | "alt";
export type Ending = "good" | "regular" | "bad";

export interface Quest {
  companion: string;
  lines: Line[];
  /** Said instead of the sacrifice choice while the companion is not ready. */
  notReady: Line;
  choices: Record<Exclude<Lesson, "alt">, { text: Line; reply: Line }>;
  /** Doubling down makes them leave the party. */
  doubleLeaves?: boolean;
  /** Holding on after seeing the cost is the bad ending, not the regular one (Centella). */
  heldAfterSeenIsBad?: boolean;
  /** Said when the companion first sees what their flaw costs. */
  seen: Line;
  endings: Record<Ending, Line>;
  /** The alternative good path. Its lines and choices replace the usual ones where given; run.ts questView says
      when it applies. */
  alt?: { lines?: Line[]; notReady?: Line; choices: Partial<Record<Lesson, { text: Line; reply: Line }>> };
  /** What the quest unlocks, by the lesson taken: a combo (data/abilities.ts COMBOS) and a line saying so. */
  unlocks?: Partial<Record<Lesson, { combo?: string; poisonWard?: number; line: Line }>>;
}

export const QUESTS: Record<string, Quest> = {
  remanso: {
    companion: "remanso",
    lines: [
      { es: "Volvéis al molino. Una criatura marcada por la Savia, una que dejasteis ir, ronda a los supervivientes.", en: "You come back to the mill. A Sap-marked creature, one you once let go, is circling the survivors." },
      { es: "Remanso: «La dejé huir. Le di otra oportunidad. Y ha vuelto a por ellos».", en: "Remanso: \"I let it run. I gave it another chance. And it came back for them.\"" },
    ],
    notReady: { es: "Remanso aprieta los puños, pero todavía cree que puede cambiar.", en: "Remanso clenches his paws, but he still believes it can change." },
    choices: {
      sacrifice: { text: { es: "«Esta vez, termínalo tú.»", en: "\"This time, you end it.\"" }, reply: { es: "Remanso da el último golpe. No mira hacia otro lado. «Algunos no tienen vuelta. Lo siento».", en: "Remanso strikes the last blow. He doesn't look away. \"Some can't come back. I'm sorry.\"" } },
      hold: { text: { es: "«Nosotros nos encargamos.»", en: "\"We'll take care of it.\"" }, reply: { es: "El grupo acaba con ella. Remanso se queda mirando el agua mucho rato.", en: "The party finishes it. Remanso stares at the water for a long time." } },
      double: { text: { es: "«Déjala ir otra vez.»", en: "\"Let it go again.\"" }, reply: { es: "Remanso: «Sí. Puede cambiar. Tiene que poder».", en: "Remanso: \"Yes. It can change. It has to.\"" } },
    },
    seen: { es: "Remanso reconoce al rival. «Ese… lo dejamos ir. Y mira lo que ha hecho».", en: "Remanso recognises the rival. \"That one… we let it go. And look what it's done.\"" },
    endings: {
      good: { es: "Remanso mantiene el molino y enseña a los supervivientes a nadar, y a pelear. Sigue sacando extraños del río, pero antes les mira las manos por si hay Savia.", en: "He keeps the mill running and teaches the survivors to swim, and to fight. He still pulls strangers out of the river, but he checks their hands for Sap first." },
      regular: { es: "Remanso sigue perdonando a todos. Casi siempre sale bien. No habla de las veces que no.", en: "He keeps sparing everyone. Most of the time it works. He doesn't talk about the times it didn't." },
      bad: { es: "El rival que salvó inunda el molino. Encuentran a Remanso río abajo, vivo, repitiendo que podía haber cambiado.", en: "The rival he saved floods the mill. Remanso is found downstream, alive, still saying it could have changed." },
    },
    // No rival left to face: the test is the mill itself.
    alt: {
      lines: [
        { es: "Volvéis al molino. El agua del canal brilla dorada: la Savia se ha metido en el estanque que lo mantiene seco.", en: "You come back to the mill. The water in the channel glows gold: the Sap has got into the pond that keeps it dry." },
        { es: "Remanso: «Si rompo la presa, el río se lleva la Savia… y el molino con ella. Es lo único que me queda».", en: "Remanso: \"If I break the dam, the river washes the Sap out… and the mill with it. It's all I have left.\"" },
      ],
      notReady: { es: "Remanso mira la presa y niega con la cabeza. «Seguro que hay otra manera».", en: "Remanso looks at the dam and shakes his head. \"There has to be another way.\"" },
      choices: {
        alt: { text: { es: "«Rómpela, Remanso. Que el río lo limpie.»", en: "\"Break it, Remanso. Let the river clean it.\"" }, reply: { es: "Remanso arranca la primera piedra con sus propias patas. El molino cae entero al río. Él no aparta la vista.", en: "Remanso pulls out the first stone with his own paws. The whole mill goes into the river. He doesn't look away." } },
        hold: { text: { es: "«Lo filtraremos. Ya encontraremos la forma.»", en: "\"We'll filter it. We'll find a way.\"" }, reply: { es: "Remanso cuela el agua con redes toda la noche. Por la mañana el estanque sigue brillando.", en: "Remanso strains the water with nets all night. By morning the pond still glows." } },
      },
    },
  },
  guijo: {
    companion: "guijo",
    doubleLeaves: true,
    lines: [
      { es: "Los túneles de la cantera. Al fondo, la familia de Guijo, marcada por la Savia. La Savia avanza por la roca hacia el campamento.", en: "The quarry tunnels. At the far end, Guijo's family, Sap-marked. The Sap is creeping through the rock towards the survivors' camp." },
      { es: "Guijo: «Si los saco, la Savia sale con ellos. Si sello el túnel…»", en: "Guijo: \"If I carry them out, the Sap comes out with them. If I seal the tunnel…\"" },
    ],
    notReady: { es: "Guijo no puede ni pensarlo. Nunca ha dejado a nadie atrás.", en: "Guijo can't even think it. He has never left anyone behind." },
    choices: {
      sacrifice: { text: { es: "«Sella el túnel, Guijo.»", en: "\"Seal the tunnel, Guijo.\"" }, reply: { es: "Guijo pone la última piedra con sus propias manos. Se queda un momento con la frente apoyada en ella.", en: "Guijo sets the last stone with his own hands. He rests his forehead on it for a moment." } },
      hold: { text: { es: "«Sácalos. Ya veremos.»", en: "\"Carry them out. We'll see.\"" }, reply: { es: "Guijo los saca uno a uno. Nadie ve las vetas grises que traen consigo.", en: "Guijo carries them out one by one. Nobody sees the grey veins they bring along." } },
      double: { text: { es: "«Quédate con ellos.»", en: "\"Stay with them.\"" }, reply: { es: "Guijo baja al túnel. «Alguien tiene que quedarse». No vuelve a subir.", en: "Guijo goes down into the tunnel. \"Someone has to stay.\" He doesn't come back up." } },
    },
    seen: { es: "Guijo se queda junto al que cayó. «Lo intentamos. No bastó. Y aun así seguimos».", en: "Guijo stays by the one who fell. \"We tried. It wasn't enough. And still we go on.\"" },
    endings: {
      good: { es: "Guijo levanta un muro alrededor del campamento con la piedra que cortó aquel día. Cada mañana talla un nombre en él.", en: "He builds a wall around the camp with the stone he cut that day. He carves one name on it every morning." },
      regular: { es: "El campamento crece. También las manchas grises de sus paredes. Guijo sigue cargando gente.", en: "The camp grows. So do the grey patches on its walls. Guijo keeps carrying people." },
      bad: { es: "La cantera está en silencio. A veces los mineros oyen golpes muy abajo, constantes, como alguien que cuenta.", en: "The quarry is quiet now. Sometimes the miners hear knocking from deep below, steady, like someone counting." },
    },
    // In battle (run.ts finishBattle): with his approval high, the party leaves a downed ally to win, and he holds.
    alt: { choices: { alt: { text: { es: "", en: "" }, reply: { es: "Guijo mira al que se quedó en el suelo. Luego mira a los que siguen en pie. «Hoy hemos salvado a más de los que hemos perdido. Lo cargaré igual». No se rompe.", en: "Guijo looks at the one left on the ground. Then at the ones still standing. \"Today we saved more than we lost. I'll carry it anyway.\" He doesn't break." } } } },
    unlocks: {
      sacrifice: { combo: "lighthouseWall", line: { es: "Combo desbloqueado: Muro Faro (el héroe con Guijo).", en: "Combo unlocked: Lighthouse Wall (the hero with Guijo)." } },
      alt: { combo: "lighthouseWall", line: { es: "Combo desbloqueado: Muro Faro (el héroe con Guijo).", en: "Combo unlocked: Lighthouse Wall (the hero with Guijo)." } },
    },
  },
  centella: {
    companion: "centella",
    doubleLeaves: true,
    heldAfterSeenIsBad: true,
    lines: [
      { es: "En el juncal quemado espera el rival que quemó la madriguera de Centella, herido, sin escapatoria.", en: "In the burned reeds waits the rival who burned Centella's den, wounded, with nowhere to run." },
      { es: "Centella: «Por fin. Llevo toda una vida esperando esto».", en: "Centella: \"At last. I've waited my whole life for this.\"" },
    ],
    notReady: { es: "Centella no escucha. Solo ve a su presa.", en: "Centella isn't listening. All she sees is her prey." },
    choices: {
      sacrifice: { text: { es: "«Mira lo que costó la caza. Déjalo ir.»", en: "\"Look what the hunt cost. Let it go.\"" }, reply: { es: "Centella tiembla de rabia. Luego baja la cola. «Dos aldeas… Vete. Antes de que cambie de idea».", en: "Centella shakes with rage. Then her tail drops. \"Two villages… Go. Before I change my mind.\"" } },
      hold: { text: { es: "«Acaba con él.»", en: "\"Finish it.\"" }, reply: { es: "Un relámpago, y se acabó. Centella se queda quieta, esperando sentir algo.", en: "One bolt, and it's over. Centella stands still, waiting to feel something." } },
      double: { text: { es: "«Caza a todos los marcados. Sola, si hace falta.»", en: "\"Hunt every marked one. Alone, if you must.\"" }, reply: { es: "Centella sale disparada hacia la tormenta sin mirar atrás.", en: "Centella bolts into the storm without looking back." } },
    },
    seen: { es: "En el campamento, los supervivientes del juncal hablan del incendio de la tormenta. Centella reconoce el lugar. Fue su fuego, el que encendió para acorralar a su presa.", en: "At camp, survivors from the marsh talk about the storm fire. Centella knows the place. It was her fire, lit to corner her prey." },
    endings: {
      good: { es: "Centella vuelve al juncal y reconstruye la primera aldea que quemó, tejado a tejado. Sigue siendo lo más rápido del valle. Ahora lo usa para llevar mensajes.", en: "She goes back to the marsh and rebuilds the first village she burned, one roof at a time. She's still the fastest thing in the valley. Now she uses it to run messages." },
      regular: { es: "Consiguió lo que quería. Sigue esperando sentirlo.", en: "She got what she wanted. She keeps waiting to feel it." },
      bad: { es: "Caza a toda criatura marcada que encuentra. Una noche, su propio pelaje empieza a brillar dorado.", en: "She hunts every Sap-marked creature she can find. One night her own fur starts to glow gold." },
    },
    // Someone else killed a rival while she waited at camp: the hunt is over, and what is left is the burned village.
    alt: {
      lines: [
        { es: "El juncal quemado. No queda presa: otro acabó con un rival mientras Centella esperaba en el campamento. Solo quedan las aldeas que ardieron.", en: "The burned reeds. There is no prey left: someone else finished a rival while Centella waited at camp. All that is left are the villages that burned." },
        { es: "Los aldeanos la reconocen. Nadie dice nada. Centella tampoco.", en: "The villagers recognise her. Nobody says anything. Neither does Centella." },
      ],
      choices: {
        alt: { text: { es: "«Quédate. Respóndeles tú.»", en: "\"Stay. Answer to them yourself.\"" }, reply: { es: "Centella se sienta entre las cenizas. «Id sin mí. Esto lo tengo que arreglar yo». Deja el grupo para el resto del viaje.", en: "Centella sits down among the ashes. \"Go on without me. This one is mine to fix.\" She leaves the party for the rest of the run." } },
        hold: { text: { es: "«Vámonos. No es culpa tuya.»", en: "\"Let's go. It's not your fault.\"" }, reply: { es: "Centella sale del juncal la primera, muy deprisa, sin mirar atrás.", en: "Centella is first out of the reeds, very fast, not looking back." } },
        double: { text: { es: "«Hay más marcados. Ve a por ellos.»", en: "\"There are more marked ones. Go after them.\"" }, reply: { es: "Centella sale disparada hacia la tormenta sin mirar atrás.", en: "Centella bolts into the storm without looking back." } },
      },
    },
    unlocks: { sacrifice: { combo: "thunderhead", line: { es: "Combo desbloqueado: Nubarrón (Centella con Remanso).", en: "Combo unlocked: Thunderhead (Centella with Remanso)." } } },
  },
  moheda: {
    companion: "moheda",
    lines: [
      { es: "En la casa de bombas, la investigación de Moheda está casi lista. Pero sus muestras están contagiando el campamento de al lado.", en: "In the pump house, Moheda's research is nearly done. But her samples are infecting the camp next door." },
      { es: "Moheda: «Un poco más y tendré la cura. Solo un poco más».", en: "Moheda: \"A little longer and I'll have the cure. Just a little longer.\"" },
    ],
    notReady: { es: "Moheda tapa sus frascos con el cuerpo. «Todavía no lo entiendes».", en: "Moheda shields her jars with her body. \"You don't understand yet.\"" },
    choices: {
      sacrifice: { text: { es: "«Quémalo todo. Muestras y notas.»", en: "\"Burn it all. Samples and notes.\"" }, reply: { es: "Moheda echa cuaderno tras cuaderno al fuego. No llora. Toma nota mental de no hacerlo.", en: "Moheda feeds notebook after notebook to the fire. She doesn't cry. She makes a mental note not to." } },
      hold: { text: { es: "«Termina la investigación.»", en: "\"Finish the research.\"" }, reply: { es: "Moheda termina. La cura funciona a medias.", en: "Moheda finishes. The cure half works." } },
      double: { text: { es: "«Pruébala en ti, para ir más rápido.»", en: "\"Test it on yourself, to go faster.\"" }, reply: { es: "Moheda se bebe el frasco. Sus esporas empiezan a brillar.", en: "Moheda drinks the jar. Her spores begin to glow." } },
    },
    seen: { es: "La herida que Moheda trató con su Seta de Savia se ha vuelto dorada. Ella la mira mucho rato y no dice nada.", en: "The wound Moheda treated with her Sap Cap has turned gold. She stares at it for a long time and says nothing." },
    endings: {
      good: { es: "Moheda solo escribe lo que recuerda, que cada año es menos. El campamento que salvó llama a su primer huerto como ella. Nada en él brilla.", en: "She writes down only what she remembers, which is less every year. The camp she saved names its first garden after her. Nothing in it glows." },
      regular: { es: "Su cura salva a unos y marca a otros. Lleva una lista de ambos y no se la enseña a nadie.", en: "Her cure saves some people and marks others. She keeps a list of both and never shows anyone." },
      bad: { es: "Las casas de bombas se llenan de esporas que brillan. Algo ahí dentro aún responde a su nombre.", en: "The pump houses fill with spores that glow. Someone in there still answers to her name." },
    },
    // Before she has seen the cost: she can still take the risk herself instead of passing it on.
    alt: { choices: { alt: { text: { es: "«Prueba la última muestra en ti, no en el paciente.»", en: "\"Test the last sample on yourself, not on the patient.\"" }, reply: { es: "Moheda se bebe la muestra despacio y anota cada síntoma. El paciente vive. Ella queda más débil el resto del viaje.", en: "Moheda drinks the sample slowly and notes every symptom. The patient lives. She stays weaker for the rest of the run." } } } },
    unlocks: { hold: { combo: "myceliumNet", poisonWard: 1, line: { es: "Combo desbloqueado: Red de Micelio (Guijo con Moheda). El grupo resiste algo mejor el veneno.", en: "Combo unlocked: Mycelium Net (Guijo with Moheda). The party resists poison a little better." } } },
  },
};
