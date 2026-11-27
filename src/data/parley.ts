/* Words before a fight (run/parley.ts picks them): foes who can talk say something as the party arrives, and the
   hero answers. Mindless creatures stay silent. Spanish and English side by side; `tools/check.ts` checks both are
   filled. {name} is the speaker's own name, {foe} the one it answers, {the} the goal's survivor. */
import type { Line } from "./rivals";

/** Who a foe talks like, by its look. Looks not listed are beasts: they do not talk. */
export type Voice = "looter" | "goblin" | "shaman" | "ratfolk" | "brute" | "troll" | "mira" | "courier" | "survivor";
export const VOICE_OF: Record<string, Voice> = {
  brasa: "looter", pena: "looter", malva: "looter", marea: "looter",
  trasgo: "goblin", "trasgo-chaman": "shaman", ratero: "ratfolk",
  ogro: "brute", trol: "troll", "mira-broken": "mira",
  aldeano: "survivor", anciana: "survivor",
};

/** What a foe leading the fight says, by voice (one is picked from the seed). */
export const OPENERS: Record<Voice, Line[]> = {
  looter: [
    { es: "Este pueblo ya no es de nadie. O sea, nuestro.", en: "This town belongs to no one now. So it's ours." },
    { es: "La Savia me susurra que lleváis algo valioso.", en: "The Sap whispers that you're carrying something worth taking." },
    { es: "Dad media vuelta y nadie saldrá herido. Bueno, casi nadie.", en: "Turn back and nobody gets hurt. Well, almost nobody." },
    { es: "¿Más héroes? Los últimos aún están en el pozo.", en: "More heroes? The last ones are still down the well." },
  ],
  goblin: [
    { es: "¡Brillante! ¡Cosas brillantes! ¡Dádnoslas!", en: "Shiny! Shiny things! Give them!" },
    { es: "¡Casa vacía, casa nuestra! ¡Fuera, fuera!", en: "Empty house, our house! Out, out!" },
    { es: "¡Jijí! Carne blandita bajando del camino.", en: "Heehee! Soft meat coming down the road." },
  ],
  shaman: [
    { es: "Los huesos dijeron que vendríais. Los huesos nunca mienten.", en: "The bones said you would come. The bones never lie." },
    { es: "La Savia canta en mi bastón. Hoy canta vuestro nombre.", en: "The Sap sings in my staff. Today it sings your names." },
  ],
  ratfolk: [
    { es: "Túneles nuestros. Agua nuestra. Vosotros... fuera.", en: "Our tunnels. Our water. You... out." },
    { es: "Olemos vuestro miedo desde las bombas, sí, sí.", en: "We smell your fear from the pumps, yes, yes." },
  ],
  brute: [
    { es: "GRRR... PLAZA... MÍA.", en: "GRRR... SQUARE... MINE." },
    { es: "¿Pequeños? Pequeños hacen crac.", en: "Little ones? Little ones go crunch." },
  ],
  troll: [
    { es: "Paso del Trol. Peaje: vosotros.", en: "Troll's crossing. Toll: you." },
    { es: "Agua fría... hambre caliente.", en: "Cold water... hot hunger." },
  ],
  mira: [
    { es: "Guardé este embalse... tanto tiempo. Ya no recuerdo para quién.", en: "I guarded this reservoir... so long. I no longer remember for whom." },
    { es: "La Savia me dio un corazón de hielo. No dejaré que me lo quitéis.", en: "The Sap gave me a heart of ice. I won't let you take it." },
  ],
  courier: [
    { es: "¡No me cogeréis! ¡El mensaje tiene que llegar!", en: "You won't catch me! The message must get through!" },
    { es: "¡Paso, paso! ¡La Savia espera noticias!", en: "Make way! The Sap awaits word!" },
  ],
  survivor: [
    { es: "¡Ayuda! ¡Por favor, no me dejéis aquí!", en: "Help! Please, don't leave me here!" },
    { es: "¡Están por todas partes! ¡No puedo correr!", en: "They're everywhere! I can't run!" },
  ],
};

/** A second foe chiming in after the leader, by voice. */
export const CHIMES: Partial<Record<Voice, Line[]>> = {
  looter: [{ es: "Yo me quedo con las botas.", en: "I'm taking the boots." }, { es: "Acabemos rápido. Hace frío.", en: "Let's make it quick. It's cold." }],
  goblin: [{ es: "¡Sí, sí! ¡Brillante!", en: "Yes, yes! Shiny!" }],
  shaman: [{ es: "Que los espíritus elijan al primero.", en: "Let the spirits pick the first one." }],
  ratfolk: [{ es: "Rodeadlos. Rodeadlos, sí.", en: "Surround them. Surround them, yes." }],
};

/** A nemesis' own words (it followed the hero from the last run). */
export const NEMESIS_OPENERS: Line[] = [
  { es: "Te dije que te encontraría. Recuerdo cada uno de tus golpes.", en: "I told you I'd find you. I remember every blow you struck." },
  { es: "Un viaje nuevo, el mismo final. Para ti.", en: "A new journey, the same ending. Yours." },
];
/** A companion back as a rival after a bad ending. */
export const RETURNED_OPENERS: Line[] = [
  { es: "Confié en ti. No volveré a cometer ese error.", en: "I trusted you. I won't make that mistake again." },
];

/** What the hero answers, by what the fight is about. */
export type Reply = "plain" | "rival" | "nemesis" | "boss" | "brute" | "protect" | "survive" | "catch";
export const REPLIES: Record<Reply, Line[]> = {
  plain: [
    { es: "No queremos pelea. Pero no vamos a retroceder.", en: "We don't want a fight. But we won't back down." },
    { es: "La Savia os ha nublado la cabeza. Os la vamos a despejar.", en: "The Sap has clouded your heads. We'll clear them." },
    { es: "Apartaos. Este camino sigue adelante.", en: "Stand aside. This road goes on." },
  ],
  rival: [
    { es: "Esta vez no habrá huida, {foe}.", en: "No running this time, {foe}." },
    { es: "Te recuerdo, {foe}. Y tú a mí, por lo que veo.", en: "I remember you, {foe}. And you me, it seems." },
  ],
  nemesis: [{ es: "Entonces terminemos lo que empezamos, {foe}.", en: "Then let's finish what we started, {foe}." }],
  boss: [{ es: "Lo que fuiste merece descanso. Te lo daremos.", en: "What you were deserves rest. We'll give it to you." }],
  brute: [{ es: "Cuidado con ese grandullón. Rodeadlo, no lo enfrentéis de cara.", en: "Mind the big one. Go around it, don't meet it head on." }],
  protect: [
    { es: "¡Aguanta, vamos a por ti! Que nadie toque a {the}.", en: "Hold on, we're coming! Nobody touches {the}." },
    { es: "{The}, lo primero. Lo demás, después.", en: "{The} first. Everything else after." },
  ],
  survive: [
    { es: "Son demasiados. Aguantad hasta que amaine.", en: "Too many of them. Hold out until it eases." },
    { es: "No hace falta ganar. Hace falta seguir en pie.", en: "We don't need to win. We need to stay standing." },
  ],
  catch: [
    { es: "¡Ese correo lleva noticias a la Savia! ¡Que no escape!", en: "That courier carries word to the Sap! Don't let it get away!" },
    { es: "Cortadle el paso al correo. Los demás pueden esperar.", en: "Cut the courier off. The rest can wait." },
  ],
};

/** A companion's word before a fight with people, sometimes, after the hero. */
export const COMPANION_LINES: Record<string, Line[]> = {
  remanso: [{ es: "Si alzan la bandera, los dejamos ir. ¿De acuerdo?", en: "If they raise the flag, we let them go. Agreed?" }],
  guijo: [{ es: "Tres días sin dormir... Uno más no me matará.", en: "Three days without sleep... One more won't kill me." }],
  centella: [{ es: "Huelo a Savia. Dejadme al primero.", en: "I smell Sap. The first one is mine." }],
  moheda: [{ es: "Fascinante. Fijaos cómo les brilla la marca.", en: "Fascinating. Look how their marks glow." }],
};
