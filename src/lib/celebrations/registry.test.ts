import { describe, it, expect } from "vitest";
import { CELEBRATIONS, getCelebrationKey, reachedMilestone, STREAK_MILESTONES } from "./registry";

describe("getCelebrationKey", () => {
  it("incluye la fecha en los eventos diarios", () => {
    expect(
      getCelebrationKey({ event: "first_activity_of_day", date: "2026-08-05" }),
    ).toBe("first_activity_of_day:2026-08-05");
    expect(
      getCelebrationKey({ event: "daily_goal_completed", date: "2026-08-05" }),
    ).toBe("daily_goal_completed:2026-08-05");
  });

  it("incluye el hito en la racha", () => {
    expect(getCelebrationKey({ event: "streak_milestone", milestone: 30 })).toBe(
      "streak_milestone:30",
    );
  });

  it("los eventos 'una vez por usuario' usan solo su nombre", () => {
    expect(getCelebrationKey({ event: "first_club_participation" })).toBe(
      "first_club_participation",
    );
  });

  it("falla si falta el dato que forma la clave", () => {
    expect(() => getCelebrationKey({ event: "streak_milestone" })).toThrow();
    expect(() => getCelebrationKey({ event: "daily_goal_completed" })).toThrow();
  });
});

describe("reachedMilestone", () => {
  it("devuelve el hito solo en los valores exactos", () => {
    for (const m of STREAK_MILESTONES) expect(reachedMilestone(m)).toBe(m);
    expect(reachedMilestone(1)).toBeNull();
    expect(reachedMilestone(8)).toBeNull();
    expect(reachedMilestone(31)).toBeNull();
  });
});

describe("eventos de la mascota", () => {
  it("pet_level_up y pet_evolved se deduplican por hito", () => {
    expect(getCelebrationKey({ event: "pet_level_up", milestone: 12 })).toBe("pet_level_up:12");
    expect(getCelebrationKey({ event: "pet_evolved", milestone: 2 })).toBe("pet_evolved:2");
    expect(CELEBRATIONS.pet_level_up.scope).toBe("milestone");
    expect(CELEBRATIONS.pet_evolved.intensity).toBe("high");
  });
});
