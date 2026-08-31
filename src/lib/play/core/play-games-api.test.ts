import { describe, expect, it, vi, beforeEach } from "vitest";

// I1 (clase #680): el adaptador usa el cliente real de supabase-js, así que la
// única forma razonable de probar la guarda de sesión viva es doblar
// `createClient` y comprobar que selectAll aborta cuando `auth.getUser()`
// devuelve un uid distinto del ownerId inyectado -- el escenario de la
// pestaña rancia (renderizada como cuenta A) con otra pestaña ya en cuenta B.
const selectMock = vi.fn();
const fromMock = vi.fn(() => ({ select: selectMock }));
const getUserMock = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { getUser: getUserMock },
    from: fromMock,
  }),
}));

import { createPlayGamesApi } from "./play-games-api";

beforeEach(() => {
  selectMock.mockReset();
  fromMock.mockClear();
  getUserMock.mockReset();
  selectMock.mockResolvedValue({ data: [], error: null });
});

describe("createPlayGamesApi().selectAll — guarda de sesión viva", () => {
  it("uid de la sesión distinto del ownerId inyectado → error, y NUNCA llega a leer filas", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "uid-B" } } });
    const api = createPlayGamesApi("uid-A");

    const result = await api.selectAll();

    expect(result).toEqual({ error: true });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("sin usuario en la sesión (getUser devuelve null) → error", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const api = createPlayGamesApi("uid-A");

    const result = await api.selectAll();

    expect(result).toEqual({ error: true });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("uid de la sesión coincide con el ownerId inyectado → sigue y lee filas", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "uid-A" } } });
    const api = createPlayGamesApi("uid-A");

    const result = await api.selectAll();

    expect(result).toEqual({ rows: [] });
    expect(fromMock).toHaveBeenCalledWith("play_games");
    expect(selectMock).toHaveBeenCalled();
  });
});
