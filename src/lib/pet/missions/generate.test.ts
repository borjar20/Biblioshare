import { describe, expect, it } from "vitest";
import { BALANCE } from "../balance";
import { PET_ATTRIBUTES, type PetAttributes } from "../classes";
import { eligibleTemplates, hashSeed, pickDailyMissions, type MissionEligibility } from "./generate";
import { MISSION_ATTR, MISSION_COST, missionXp } from "./templates";

const ALL: MissionEligibility = {
  hasClub: true,
  hasOpenSeries: true,
  dailyGoal: 30,
  finishCandidate: { itemType: "book", itemId: "b1", title: "Dune" },
  reviewCandidate: { itemType: "book", itemId: "b2", title: "Emma" },
};
const NONE: MissionEligibility = { hasClub: false, hasOpenSeries: false, dailyGoal: null, finishCandidate: null, reviewCandidate: null };
const flat: PetAttributes = { FUE: 10, CON: 10, INT: 10, SAB: 10, CAR: 10, DES: 10 };

describe("hashSeed", () => {
  it("es determinista y distingue seeds", () => {
    expect(hashSeed("u1:2026-09-03")).toBe(hashSeed("u1:2026-09-03"));
    expect(hashSeed("u1:2026-09-03")).not.toBe(hashSeed("u1:2026-09-04"));
  });
});

describe("eligibleTemplates", () => {
  it("sin club, sin serie, sin objetivo y sin candidatas quita post/vote/episodes/daily_goal/review/finish_pass", () => {
    const e = eligibleTemplates(NONE);
    expect(e).toEqual(["rating", "new_work", "any_activity", "session_minutes", "note", "quote", "session_pages"]);
  });
  it("con todo, todas", () => {
    expect(eligibleTemplates(ALL)).toHaveLength(13);
  });
});

describe("pickDailyMissions", () => {
  it("devuelve 3 huecos: primario, flojo (distinto del primario) y azar, sin repetir atributo ni plantilla", () => {
    const attrs: PetAttributes = { ...flat, SAB: 0 };
    const picks = pickDailyMissions("u1:2026-09-03", "FUE", attrs, ALL);
    expect(picks).toHaveLength(3);
    expect(MISSION_ATTR[picks[0].template]).toBe("FUE");
    expect(MISSION_ATTR[picks[1].template]).toBe("SAB");
    const attrsUsed = picks.map((p) => MISSION_ATTR[p.template]);
    expect(new Set(attrsUsed).size).toBe(3);
    expect(new Set(picks.map((p) => p.template)).size).toBe(3);
  });

  it("es determinista por seed y cambia con el seed", () => {
    const a = pickDailyMissions("u1:2026-09-03", "FUE", flat, ALL);
    const b = pickDailyMissions("u1:2026-09-03", "FUE", flat, ALL);
    expect(a).toEqual(b);
    const seeds = Array.from({ length: 30 }, (_, i) => `u1:2026-09-${String(i + 1).padStart(2, "0")}`);
    const distinct = new Set(seeds.map((s) => JSON.stringify(pickDailyMissions(s, "FUE", flat, ALL))));
    expect(distinct.size).toBeGreaterThan(1);
  });

  it("los huecos 0 y 1 nunca son duras; la dura solo va en el hueco 2 y como mucho una", () => {
    for (let i = 0; i < 40; i++) {
      const picks = pickDailyMissions(`u${i}:2026-09-03`, "SAB", { ...flat, INT: 0 }, ALL);
      expect(MISSION_COST[picks[0].template]).not.toBe("hard");
      expect(MISSION_COST[picks[1].template]).not.toBe("hard");
      expect(picks.filter((p) => MISSION_COST[p.template] === "hard").length).toBeLessThanOrEqual(1);
    }
  });

  it("con una dura elegible cuyo atributo no está usado, el hueco 2 es esa dura y lleva la obra", () => {
    // Primario FUE, flojo CAR (0). INT queda libre → finish_pass.
    const picks = pickDailyMissions("u1:2026-09-03", "FUE", { ...flat, CAR: 0 }, { ...ALL, reviewCandidate: null });
    expect(picks[2].template).toBe("finish_pass");
    expect(picks[2]).toMatchObject({ itemType: "book", itemId: "b1", title: "Dune", target: 1, xp: BALANCE.INT.perFinishedPass });
  });

  it("sin duras elegibles, el hueco 2 es media (o ligera si no queda media)", () => {
    const picks = pickDailyMissions("u1:2026-09-03", "FUE", { ...flat, CAR: 0 }, { ...ALL, finishCandidate: null, reviewCandidate: null });
    expect(MISSION_COST[picks[2].template]).not.toBe("hard");
  });

  it("si el flojo empata, gana el primero en el orden de PET_ATTRIBUTES distinto del primario", () => {
    const picks = pickDailyMissions("u1:2026-09-03", "FUE", flat, ALL);
    // Todos empatan: el primero distinto de FUE en el orden es CON.
    expect(MISSION_ATTR[picks[1].template]).toBe(PET_ATTRIBUTES.filter((a) => a !== "FUE")[0]);
  });

  it("un atributo sin plantilla elegible cede el hueco al siguiente del orden", () => {
    // Sin club: CAR no tiene plantillas. Primario CAR → hueco 0 toma el siguiente con plantillas.
    const picks = pickDailyMissions("u1:2026-09-03", "CAR", flat, NONE);
    expect(MISSION_ATTR[picks[0].template]).not.toBe("CAR");
    expect(picks).toHaveLength(3);
  });

  it("congela objetivo y XP: daily_goal copia el objetivo del perfil", () => {
    const picks = pickDailyMissions("u1:2026-09-03", "CON", { ...flat, CON: 0 }, { ...NONE, dailyGoal: 45 });
    const dg = picks.find((p) => p.template === "daily_goal");
    if (dg) expect(dg.target).toBe(45);
    for (const p of picks) expect(p.xp).toBe(missionXp(p.template));
  });
});
