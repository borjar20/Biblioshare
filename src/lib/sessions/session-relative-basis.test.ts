import { describe, it, expect } from "vitest";
import { todayISO } from "@/lib/stats/dates";
import { sessionRelativeBasis } from "./session-relative-basis";

describe("sessionRelativeBasis", () => {
  it("usa created_at cuando la sesión es de hoy", () => {
    expect(
      sessionRelativeBasis("2026-07-28", "2026-07-28T20:15:00.000Z", "2026-07-28"),
    ).toBe("2026-07-28T20:15:00.000Z");
  });

  it("usa session_date cuando la sesión está backdateada", () => {
    expect(
      sessionRelativeBasis("2026-07-27", "2026-07-28T09:00:00.000Z", "2026-07-28"),
    ).toBe("2026-07-27");
  });

  it("usa todayISO() por defecto cuando no se pasa 'today'", () => {
    expect(sessionRelativeBasis(todayISO(), "created-at-value")).toBe(
      "created-at-value",
    );
  });
});
