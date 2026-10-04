import "fake-indexeddb/auto";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { __resetDbForTests, startSavedSession, purgeSyncedSavedFor } from "./db";
import { authSession, deferred } from "./saved-session-fixtures.test-support";

// I1 (clase #680): el adaptador usa el cliente real de supabase-js, así que la
// única forma razonable de probar la guarda de sesión viva es doblar
// `createClient` y comprobar que selectAll aborta cuando `auth.getUser()`
// devuelve un uid distinto del ownerId inyectado -- el escenario de la
// pestaña rancia (renderizada como cuenta A) con otra pestaña ya en cuenta B.
const selectMock = vi.fn();
const upsertMock = vi.fn();
const inMock = vi.fn();
const eqMock = vi.fn<(field: string, owner: string) => { in: typeof inMock }>(() => ({ in: inMock }));
const deleteMock = vi.fn(() => ({ eq: eqMock, in: inMock }));
const fromMock = vi.fn(() => ({ select: selectMock, upsert: upsertMock, delete: deleteMock }));
const getUserMock = vi.fn();
const getSessionMock = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { getUser: getUserMock, getSession: getSessionMock },
    from: fromMock,
  }),
}));

import { createPlayGamesApi } from "./play-games-api";

beforeEach(async () => {
  await __resetDbForTests();
  selectMock.mockReset();
  fromMock.mockClear();
  upsertMock.mockReset().mockResolvedValue({ error: null });
  inMock.mockReset().mockResolvedValue({ error: null });
  deleteMock.mockReset().mockImplementation(() => ({ eq: eqMock, in: inMock }));
  eqMock.mockReset().mockImplementation(() => ({ in: inMock }));
  getUserMock.mockReset();
  getSessionMock.mockReset().mockResolvedValue(authSession());
  selectMock.mockResolvedValue({ data: [], error: null });
});
afterEach(async () => { await __resetDbForTests(); });

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
    expect(getUserMock).toHaveBeenCalledWith(authSession().data.session.access_token);
  });

  it("JWT local no autoriza: un error del getUser del servidor no registra ni lee filas", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "uid-A" } }, error: new Error("token no validado") });
    expect(await createPlayGamesApi("uid-A").selectAll()).toEqual({ error: true });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("cambio A→B durante el select descarta la respuesta de A", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "uid-A" } }, error: null });
    const response = deferred<{ data: never[]; error: null }>();
    selectMock.mockReturnValue(response.promise);
    const running = createPlayGamesApi("uid-A").selectAll();
    await vi.waitFor(() => expect(selectMock).toHaveBeenCalled());
    getSessionMock.mockResolvedValue(authSession("uid-B", "session-B"));
    response.resolve({ data: [], error: null });
    expect(await running).toEqual({ error: true });
  });

  it("ABA real de Auth: la sesión retirada no reabre, un login nuevo sí y refresh conserva generación", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "uid-A" } }, error: null });
    const first = (await createPlayGamesApi("uid-A").prepareSession!())!;
    await purgeSyncedSavedFor("uid-A", "session-A");
    getSessionMock.mockResolvedValue(authSession("uid-A", "session-next"));
    const next = (await createPlayGamesApi("uid-A").prepareSession!())!;
    expect(next.generation).toBeGreaterThan(first.generation);
    getSessionMock.mockResolvedValue(authSession("uid-A", "session-next", 99));
    expect(await createPlayGamesApi("uid-A").prepareSession!()).toEqual(next);
    getSessionMock.mockResolvedValue(authSession());
    expect(await createPlayGamesApi("uid-A").selectAll()).toEqual({ error: true });
    expect(await startSavedSession("uid-A", "session-A")).toBeNull();
  });

  it("cambio de identidad antes de push/remove no llega al backend", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "uid-A" } }, error: null });
    const api = createPlayGamesApi("uid-A");
    expect(await api.prepareSession!()).not.toBeNull();
    getSessionMock.mockResolvedValue(authSession("uid-B", "session-B"));
    expect(await api.upsert([])).toEqual({ error: true });
    expect(await api.remove(["id-A"])).toEqual({ error: true });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("si Auth cambia justo al enviar remove, el filtro de propietario preserva la fila de B", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "uid-A" } }, error: null });
    // Frontera remota doblada: el builder aplica los filtros a las filas que
    // RLS dejaría ver a la identidad al enviar la petición. No ejecuta SQL.
    const remote = new Map([["id-A", { owner: "uid-B" }]]);
    let filterOwner: string | undefined;
    deleteMock.mockImplementation(() => {
      getSessionMock.mockResolvedValue(authSession("uid-B", "session-B"));
      return { eq: eqMock, in: inMock };
    });
    eqMock.mockImplementation((_field, owner) => { filterOwner = owner; return { in: inMock }; });
    inMock.mockImplementation(async (_field, ids: string[]) => {
      for (const id of ids) {
        const row = remote.get(id);
        if (row?.owner === "uid-B" && (filterOwner === undefined || row.owner === filterOwner)) remote.delete(id);
      }
      return { error: null };
    });
    expect(await createPlayGamesApi("uid-A").remove(["id-A"])).toEqual({ error: false });
    expect(remote.get("id-A")).toEqual({ owner: "uid-B" });
  });
});
