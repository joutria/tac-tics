/* M4: starting heroes picked at the camp, and the crossover characters from Evolvlings waiting on the maps. */
import { describe, expect, it } from "vitest";
import { choose, enterNode, heroBase, heroMaxHp, heroOf, leaveShop, newRun, regionMap, type RunState } from "../src/run/run";
import { guestsOpen, newLegacy, starterPicked } from "../src/run/legacy";
import { STARTERS } from "../src/data/starters";
import { CROSSOVER } from "../src/data/crossover";
import { COMPANIONS, TALKS } from "../src/data/companions";
import { JOB_LAYER, JOBS } from "../src/data/jobs";
import { ABILITIES } from "../src/data/abilities";
import { HERO_LOOKS, lookArt } from "../src/data/units";
import { newMember } from "../src/run/party";
import { existsSync } from "node:fs";

describe("starting heroes", () => {
  it("every starter is the unit 'hero', with real cards and a job for each lean", () => {
    for (const st of Object.values(STARTERS)) {
      expect(st.spec.id).toBe("hero");
      for (const a of [...st.spec.abilities, st.spec.quick!]) expect(ABILITIES[a], `${st.id}: ${a}`).toBeTruthy();
      expect(JOBS[st.jobs.beacon].lean).toBe("beacon");
      expect(JOBS[st.jobs.blaze].lean).toBe("blaze");
      expect(existsSync(`public/${lookArt(st.spec.look)}`)).toBe(true);
    }
  });

  it("a run led by the Vanguard fights with her spec and starts at her HP; old runs are led by the hero of Light", () => {
    const run = newRun("vanguard", "normal", undefined, undefined, { starter: "vanguard" });
    expect(run.starter).toBe("vanguard");
    expect(heroOf(run).abilities).toEqual(STARTERS.vanguard.spec.abilities);
    expect(run.heroHp).toBe(heroMaxHp(run));
    expect(heroMaxHp(run)).toBe(STARTERS.vanguard.spec.hp);
    const plain = newRun("vanguard");
    expect(plain.starter).toBeUndefined();
    expect(heroBase(plain)).toBe(STARTERS.light.spec);
    // The map does not depend on who leads.
    expect(run.map).toEqual(plain.map);
  });

  it("the job offer halfway through the first region comes from the starter's own pair", () => {
    let run: RunState = newRun("jobs", "normal", undefined, undefined, { starter: "scout" });
    const node = run.map.nodes.find((n) => n.layer === JOB_LAYER && ["rest", "shop", "recruit"].includes(n.kind))!;
    run = { ...run, at: run.map.nodes.find((n) => n.next.includes(node.id))!.id, leanings: { beacon: 0, blaze: 2 } };
    run = enterNode(run, node.id, "en");
    expect(run.offers.find((o) => o.kind === "job")).toEqual({ kind: "job", options: ["hunter"] });
    while (run.offers[0]!.kind !== "job") run = run.offers[0]!.kind === "shop" ? leaveShop(run) : choose(run, 0);
    run = choose(run, 0);
    expect(run.hero.job).toBe("hunter");
    expect(heroOf(run).abilities).toEqual(expect.arrayContaining(JOBS.hunter.abilities));
    expect(heroOf(run).passive).toBe("executioner");
  });

  it("the camp only lets an opened starter lead", () => {
    const legacy = { ...newLegacy(), starter: "scout" as const };
    expect(starterPicked(legacy).id).toBe("light");
    expect(starterPicked({ ...legacy, milestones: ["region1"] }).id).toBe("scout");
  });
});

describe("crossover characters", () => {
  it("each one is a companion with a talk, drawn art and real cards", () => {
    for (const c of CROSSOVER) {
      const comp = COMPANIONS[c.companion]!;
      expect(comp, c.companion).toBeTruthy();
      expect(TALKS[c.talk]!.companion).toBe(c.companion);
      for (const a of comp.spec.abilities) expect(ABILITIES[a]).toBeTruthy();
      expect(existsSync(`public/${lookArt(comp.spec.look)}`)).toBe(true);
    }
    expect(HERO_LOOKS.has("tila") && HERO_LOOKS.has("nim")).toBe(true);
  });

  it("open only once every milestone they need is reached", () => {
    expect(guestsOpen(newLegacy())).toEqual([]);
    expect(guestsOpen({ ...newLegacy(), milestones: ["runWon"] }).map((c) => c.companion)).toEqual(["tila"]);
    expect(guestsOpen({ ...newLegacy(), milestones: ["runWon", "anyGood"] }).map((c) => c.companion)).toEqual(["tila", "nim", "unisona"]);
  });

  it("an opened guest waits on its region's map as a recruit; runs without guests keep their maps", () => {
    const plain = newRun("guests"), withTila = newRun("guests", "normal", undefined, undefined, { guests: ["tila"] });
    expect(withTila.guests).toEqual(["tila"]);
    const spot = withTila.map.nodes.find((n) => n.recruit === "tila.meet")!;
    expect(spot.layer).toBe(4);
    expect(plain.map.nodes.some((n) => n.recruit === "tila.meet")).toBe(false);
    // Unknown ids are dropped.
    expect(newRun("guests", "normal", undefined, undefined, { guests: ["nobody"] }).map).toEqual(plain.map);
  });

  it("Tila joins like any companion", () => {
    let run = newRun("guests", "normal", undefined, undefined, { guests: ["tila"] });
    const spot = run.map.nodes.find((n) => n.recruit === "tila.meet")!;
    run = { ...run, at: run.map.nodes.find((n) => n.next.includes(spot.id))!.id };
    run = enterNode(run, spot.id, "en");
    while (run.offers[0] && run.offers[0].kind !== "talk") run = run.offers[0].kind === "shop" ? leaveShop(run) : choose(run, 0);
    expect(run.offers[0]).toEqual({ kind: "talk", id: "tila.meet" });
    run = choose(run, 0);
    expect(run.party.map((m) => m.id)).toContain("tila");
  });

  it("Unísona only comes while Tila and Nim both travel with the party", () => {
    const guests = ["tila", "nim", "unisona"];
    const base: RunState = { ...newRun("duet", "normal", undefined, undefined, { guests }), region: 1, map: regionMap("duet", 1, guests) };
    const spot = base.map.nodes.find((n) => n.recruit === "unisona.meet")!;
    expect(spot.layer).toBe(4);
    const enter = (members: string[]) =>
      enterNode({ ...base, party: members.map((id) => newMember(id, 0, true)), at: base.map.nodes.find((n) => n.next.includes(spot.id))!.id }, spot.id, "en");
    const alone = enter(["tila"]);
    expect(alone.offers.some((o) => o.kind === "talk")).toBe(false);
    expect(alone.remarks).toContainEqual(CROSSOVER.find((c) => c.companion === "unisona")!.missing);
    expect(enter(["tila", "nim"]).offers.some((o) => o.kind === "talk" && o.id === "unisona.meet")).toBe(true);
  });
});
