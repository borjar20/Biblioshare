import { describe, expect, it, vi, beforeEach } from "vitest";

// I1 (clase #680), calcado de play-games-api.test.ts: mismo doble de
// `createClient`, misma comprobación de que la guarda de sesión viva corta
// selectAll ANTES de tocar la tabla cuando el uid de la sesión no coincide
// con el ownerId inyectado.
const selectMock = vi.fn();
const fromMock = vi.fn(() => ({ select: selectMock }));
const getUserMock = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { getUser: getUserMock },
    from: fromMock,
  }),
}));

import { createPlayPlayersApi } from "./play-players-api";

beforeEach(() => {
  selectMock.mockReset();
  fromMock.mockClear();
  getUserMock.mockReset();
  selectMock.mockResolvedValue({ data: [], error: null });
});

describe("createPlayPlayersApi().selectAll — guarda de sesión viva", () => {
  it("uid de la sesión distinto del ownerId inyectado → error, y NUNCA llega a leer filas", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "uid-B" } } });
    const api = createPlayPlayersApi("uid-A");

    const result = await api.selectAll();

    expect(result).toEqual({ error: true });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("sin usuario en la sesión (getUser devuelve null) → error", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const api = createPlayPlayersApi("uid-A");

    const result = await api.selectAll();

    expect(result).toEqual({ error: true });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("uid de la sesión coincide con el ownerId inyectado → sigue y lee filas", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "uid-A" } } });
    const api = createPlayPlayersApi("uid-A");

    const result = await api.selectAll();

    expect(result).toEqual({ rows: [] });
    expect(fromMock).toHaveBeenCalledWith("play_players");
    expect(selectMock).toHaveBeenCalled();
  });
});
