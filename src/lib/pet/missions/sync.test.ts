import { describe, expect, it, vi } from "vitest";
import type { createClient } from "@/lib/supabase/server";
import type { PetAttributes } from "../classes";
import type { MissionEligibility } from "./generate";
import { EMPTY_DAY_COUNTS } from "./progress";
import { syncDailyMissions } from "./sync";

type Client = Awaited<ReturnType<typeof createClient>>;

const NONE: MissionEligibility = { hasClub: false, hasOpenSeries: false, dailyGoal: null, finishCandidate: null, reviewCandidate: null };
const flat: PetAttributes = { FUE: 10, CON: 10, INT: 10, SAB: 10, CAR: 10, DES: 10 };

type Row = {
  id: string; day: string; slot: number; template: string; target: number; xp: number;
  item_type: string | null; item_id: string | null; item_title: string | null; completed_at: string | null;
};

/** Cliente de mentira: cualquier cadena `.from().select()...` se resuelve con
 *  `rows`; un `upsert` devuelve lo que se le pasó con ids inventados. Solo lo
 *  justo para observar CUÁNDO se llama a la elegibilidad. */
function fakeClient(rows: Row[]) {
  const upserts: unknown[][] = [];
  const builder = (resolveWith: () => unknown) => {
    const b: Record<string, unknown> = {};
    const chain = () => b;
    for (const m of ["select", "eq", "in", "gte", "order", "is", "update"]) b[m] = chain;
    b.upsert = (payload: Record<string, unknown>[]) => {
      upserts.push(payload);
      return builder(() => payload.map((p, i) => ({ id: `new-${i}`, completed_at: null, ...p })));
    };
    b.then = (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
      Promise.resolve({ data: resolveWith(), error: null }).then(onFulfilled, onRejected);
    return b;
  };
  const client = { from: () => builder(() => rows) } as unknown as Client;
  return { client, upserts };
}

const input = (eligibility: () => Promise<MissionEligibility>) => ({
  today: "2026-09-03",
  primary: "FUE" as const,
  attributes: flat,
  eligibility,
  days: { today: EMPTY_DAY_COUNTS, yesterday: EMPTY_DAY_COUNTS },
});

describe("syncDailyMissions: la elegibilidad es perezosa (#1037)", () => {
  it("con las misiones de hoy ya guardadas NO consulta la elegibilidad", async () => {
    const rows: Row[] = [0, 1, 2].map((slot) => ({
      id: `r${slot}`, day: "2026-09-03", slot, template: "session_minutes", target: 20, xp: 2,
      item_type: null, item_id: null, item_title: null, completed_at: null,
    }));
    const { client, upserts } = fakeClient(rows);
    const eligibility = vi.fn(async () => NONE);

    const result = await syncDailyMissions(client, "u1", input(eligibility));

    expect(eligibility).not.toHaveBeenCalled();
    expect(upserts).toHaveLength(0);
    expect(result.missions).toHaveLength(3);
  });

  it("sin filas de hoy consulta la elegibilidad UNA vez y genera tres misiones", async () => {
    const { client, upserts } = fakeClient([]);
    const eligibility = vi.fn(async () => NONE);

    const result = await syncDailyMissions(client, "u1", input(eligibility));

    expect(eligibility).toHaveBeenCalledTimes(1);
    expect(upserts).toHaveLength(1);
    expect(upserts[0]).toHaveLength(3);
    expect(result.missions.map((m) => m.slot)).toEqual([0, 1, 2]);
  });
});
