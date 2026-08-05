import { describe, it, expect } from "vitest";
import { getCelebrationKey, reachedMilestone, STREAK_MILESTONES } from "./registry";

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
