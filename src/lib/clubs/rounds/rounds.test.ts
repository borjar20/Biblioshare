import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getCurrentUser: vi.fn(),
  notifyClub: vi.fn(),
  revalidateClubPages: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
  getCurrentUser: mocks.getCurrentUser,
}));
vi.mock("@/lib/clubs/activities/notify-club", () => ({ notifyClub: mocks.notifyClub }));
vi.mock("@/lib/reactivity/revalidate", () => ({
  revalidateClubPages: mocks.revalidateClubPages,
}));

import { ensureHouseRound, proposeRound } from "./rounds";

// No se testea el cálculo de semana/turno aquí -- eso vive en SQL y lo cubre
// la matriz transaccional (supabase/tests/club_rounds.sql). Esto solo cubre
// la validación de entrada y los efectos que sí son lógica de TypeScript.
function makeRpcClient(response: { data: unknown; error: unknown }) {
  return { rpc: vi.fn().mockResolvedValue(response) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue({ id: "user-1" });
  mocks.notifyClub.mockResolvedValue(undefined);
});

describe("proposeRound", () => {
  it("lanza si no hay sesión", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);

    await expect(proposeRound("club-1", "hola", null)).rejects.toThrow("not_authenticated");
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it.each(["", "   "])("lanza con texto vacío o solo espacios (%j)", async (prompt) => {
    await expect(proposeRound("club-1", prompt, null)).rejects.toThrow("prompt_required");
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("lanza con texto de más de 500 caracteres", async () => {
    await expect(proposeRound("club-1", "a".repeat(501), null)).rejects.toThrow(
      "prompt_too_long",
    );
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("no lanza justo en 500 caracteres -- el límite es inclusivo, como el CHECK de la BD", async () => {
    const client = makeRpcClient({ data: "round-1", error: null });
    mocks.createClient.mockResolvedValue(client);

    await expect(proposeRound("club-1", "a".repeat(500), null)).resolves.toEqual({ ok: true });
  });

  it("camino feliz: llama a la RPC, a notifyClub y revalida, y devuelve ok", async () => {
    const client = makeRpcClient({ data: "round-1", error: null });
    mocks.createClient.mockResolvedValue(client);

    await expect(
      proposeRound("club-1", "¿Qué leemos?", { itemType: "book", itemId: "item-1" }),
    ).resolves.toEqual({ ok: true });

    expect(client.rpc).toHaveBeenCalledWith("ensure_club_round", {
      p_club_id: "club-1",
      p_prompt: "¿Qué leemos?",
      p_item_type: "book",
      p_item_id: "item-1",
    });
    expect(mocks.notifyClub).toHaveBeenCalledWith(
      client,
      "club-1",
      "user-1",
      "club_round_proposed",
      "round-1",
    );
    expect(mocks.revalidateClubPages).toHaveBeenCalledOnce();
  });

  // Next.js redacta el `message` de un Error lanzado desde una server action
  // en build de producción (ver el comentario de ProposeRoundResult en
  // rounds.ts): un throw aquí nunca llegaría legible a la UI. Por eso los
  // dos errores de dominio de la RPC son un resultado, no una excepción.
  it.each(["round_already_open", "not_your_turn"] as const)(
    "no lanza el error de dominio %s de la RPC -- lo devuelve como resultado",
    async (reason) => {
      const client = makeRpcClient({ data: null, error: { message: reason } });
      mocks.createClient.mockResolvedValue(client);

      await expect(proposeRound("club-1", "hola", null)).resolves.toEqual({
        ok: false,
        reason,
      });
      expect(mocks.notifyClub).not.toHaveBeenCalled();
      expect(mocks.revalidateClubPages).not.toHaveBeenCalled();
    },
  );

  it("sí lanza otros errores de la RPC, sin envolverlos", async () => {
    const client = makeRpcClient({ data: null, error: { message: "other_pg_error" } });
    mocks.createClient.mockResolvedValue(client);

    await expect(proposeRound("club-1", "hola", null)).rejects.toMatchObject({
      message: "other_pg_error",
    });
    expect(mocks.notifyClub).not.toHaveBeenCalled();
    expect(mocks.revalidateClubPages).not.toHaveBeenCalled();
  });
});

describe("ensureHouseRound", () => {
  it("devuelve el id de la ronda y revalida", async () => {
    const client = makeRpcClient({ data: "round-house", error: null });
    mocks.createClient.mockResolvedValue(client);

    const id = await ensureHouseRound("club-1");

    expect(id).toBe("round-house");
    expect(client.rpc).toHaveBeenCalledWith("ensure_club_round", { p_club_id: "club-1" });
    expect(mocks.revalidateClubPages).toHaveBeenCalledOnce();
  });
});
