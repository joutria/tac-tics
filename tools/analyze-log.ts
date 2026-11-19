/* Reads play logs (files players export from the Stats panel, or `npm run simulate:run -- 100 normal --log x.json`)
   and prints what they add up to. Run with `npm run analyze -- <file> [<file>...] [--src player|sim]`.
   Several files are read together, so logs from different players can be pooled. */
import { readFileSync } from "node:fs";
import { LOG_VERSION, summarize, summaryLines, type PlayEvent } from "../src/run/playlog";

const args = process.argv.slice(2);
const srcAt = args.indexOf("--src");
const only = srcAt >= 0 ? args.splice(srcAt, 2)[1] : undefined;
if (!args.length) { console.error("usage: npm run analyze -- <playlog.json> [...] [--src player|sim]"); process.exit(1); }

let events: PlayEvent[] = [];
for (const file of args) {
  const data = JSON.parse(readFileSync(file, "utf8")) as { events?: PlayEvent[] } | PlayEvent[];
  const list = Array.isArray(data) ? data : data.events ?? [];
  const usable = list.filter((e) => e.v === LOG_VERSION && (!only || e.src === only));
  console.log(`${file}: ${usable.length} events`);
  events = events.concat(usable);
}
console.log(summaryLines(summarize(events)).join("\n"));
