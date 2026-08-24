import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getInteractionSummary: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/social/get-interaction-summary", () => ({
  getInteractionSummary: mocks.getInteractionSummary,
}));

import { listRoundHistory } from "./history";

// No se testea la GENERACIÓN de la serie de semanas ISO aquí -- eso vive en
// SQL (list_club_round_weeks, verificado a mano en dev y prod contra
// pg_proc, ver la migración 20260814_club_round_history_weeks). Esto solo
// cubre cómo listRoundHistory traduce lo que la RPC ya le da: huecos "Sin
// ronda" sin interaction summary, exclusión del periodo indicado, y el
// paso-a-través del error.
function makeClient(rows: unknown[]) {
  return { rpc: vi.fn().mockResolvedValue({ data: rows, error: null }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getInteractionSummary.mockResolvedValue(new Map());
});

describe("listRoundHistory", () => {
  it("llama a list_club_round_weeks con el club y el nº de semanas pedido", async () => {
    const client = makeClient([]);
    mocks.createClient.mockResolvedValue(client);

    await listRoundHistory("club-1", "2026-W32", 4);

    expect(client.rpc).toHaveBeenCalledWith("list_club_round_weeks", {
      p_club_id: "club-1",
      p_weeks: 4,
    });
  });

  it("una semana sin ronda (round_id null) sale con prompt null y 0 respuestas, sin pedir su interaction summary", async () => {
    const rows = [
      { period_key: "2026-W31", round_id: "round-1", author_id: "user-1", prompt: "¿Qué leemos?" },
      { period_key: "2026-W30", round_id: null, author_id: null, prompt: null },
    ];
    const client = makeClient(rows);
    mocks.createClient.mockResolvedValue(client);
    mocks.getInteractionSummary.mockResolvedValue(new Map([["round-1", { commentCount: 3 }]]));

    await expect(listRoundHistory("club-1", "2026-W32", 4)).resolves.toEqual([
      { periodKey: "2026-W31", prompt: "¿Qué leemos?", answerCount: 3 },
      { periodKey: "2026-W30", prompt: null, answerCount: 0 },
    ]);
    // getInteractionSummary exige un interaction_target real por id: la
    // semana sin ronda no tiene fila en club_rounds y por tanto no tiene
    // uno -- nunca debe viajar en el lote.
    expect(mocks.getInteractionSummary).toHaveBeenCalledWith(client, "club_round", ["round-1"]);
  });

  it("todas las semanas sin ronda: ni siquiera llama a getInteractionSummary con ids", async () => {
    const rows = [
      { period_key: "2026-W31", round_id: null, author_id: null, prompt: null },
      { period_key: "2026-W30", round_id: null, author_id: null, prompt: null },
    ];
    const client = makeClient(rows);
    mocks.createClient.mockResolvedValue(client);

    await expect(listRoundHistory("club-1", "2026-W32", 4)).resolves.toEqual([
      { periodKey: "2026-W31", prompt: null, answerCount: 0 },
      { periodKey: "2026-W30", prompt: null, answerCount: 0 },
    ]);
    expect(mocks.getInteractionSummary).toHaveBeenCalledWith(client, "club_round", []);
  });

  it("excluye el periodo pasado en currentPeriodKey aunque la RPC lo devuelva (issue #408: ronda histórica ya pintada arriba de RoundHistory)", async () => {
    const rows = [
      { period_key: "2026-W31", round_id: "round-1", author_id: "user-1", prompt: "A" },
      { period_key: "2026-W30", round_id: "round-2", author_id: "user-2", prompt: "B" },
    ];
    const client = makeClient(rows);
    mocks.createClient.mockResolvedValue(client);

    const result = await listRoundHistory("club-1", "2026-W31", 4);
    expect(result.map((r) => r.periodKey)).toEqual(["2026-W30"]);
  });

  it("relanza el error de la RPC sin envolverlo", async () => {
    const client = { rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } }) };
    mocks.createClient.mockResolvedValue(client);

    await expect(listRoundHistory("club-1", "2026-W32")).rejects.toMatchObject({ message: "boom" });
  });
});
