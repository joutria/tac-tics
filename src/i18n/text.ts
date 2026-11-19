/* Every text the player sees lives here, Spanish and English side by side. `tools/check.ts` fails if a key
   is missing in either language. */
export const TEXT = {
  es: {
    title: "Tac-tics",
    turnOf: "Turno de {name}",
    round: "Ronda {n}",
    endTurn: "Terminar turno",
    mp: "PM",
    ap: "PA",
    saved: "Partida guardada",
    resume: "Continuar partida guardada",
    newBattle: "Nueva batalla",
    language: "Idioma",
    hint: "Toca una casilla resaltada para moverte.",
  },
  en: {
    title: "Tac-tics",
    turnOf: "{name}'s turn",
    round: "Round {n}",
    endTurn: "End turn",
    mp: "MP",
    ap: "AP",
    saved: "Game saved",
    resume: "Resume saved game",
    newBattle: "New battle",
    language: "Language",
    hint: "Tap a highlighted tile to move.",
  },
} as const;

export type Lang = keyof typeof TEXT;
export type TextKey = keyof typeof TEXT.es;

export function t(lang: Lang, key: TextKey, vars: Record<string, string | number> = {}): string {
  return (TEXT[lang][key] as string).replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));
}
