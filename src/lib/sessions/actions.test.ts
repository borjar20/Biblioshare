import { beforeEach, describe, expect, it, vi } from "vitest";

// #717: registrar una sesión y cambiar de estado en el MISMO gesto son
// afirmaciones sobre la misma lectura. Cuando el estado elegido archiva el pase
// y crea otro (releer algo ya cerrado), todo lo que se escribe —sesión, cursor,
// episodios y notas— tiene que caer en el pase que queda VIVO.
//
// Antes la transición corría al final y esas escrituras se quedaban colgando del
// pase recién archivado. Estos casos fallan contra aquel orden.

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  redirect: vi.fn(),
  getActivePass: vi.fn(),
  isAutoCloseable: vi.fn(),
  applyTransition: vi.fn(),
  getEditions: vi.fn(),
  primaryEdition: vi.fn(),
  markEpisodeWatched: vi.fn(),
  rollSeriesProgress: vi.fn(),
  revalidateReadingLog: vi.fn(),
  createPost: vi.fn(),
  earnDailyLoopCelebrations: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/passes/get-passes", () => ({
  getActivePass: mocks.getActivePass,
  isAutoCloseable: mocks.isAutoCloseable,
}));
vi.mock("@/lib/passes/apply-transition", () => ({ applyTransition: mocks.applyTransition }));
vi.mock("@/lib/editions/get-editions", () => ({ getEditions: mocks.getEditions }));
vi.mock("@/lib/editions/edition-label", () => ({ primaryEdition: mocks.primaryEdition }));
vi.mock("@/lib/series/episode-watch-store", () => ({
  markEpisodeWatched: mocks.markEpisodeWatched,
  rollSeriesProgress: mocks.rollSeriesProgress,
}));
vi.mock("@/lib/reactivity/revalidate", () => ({
  revalidateReadingLog: mocks.revalidateReadingLog,
}));
vi.mock("@/lib/social/post-actions", () => ({ createPost: mocks.createPost }));
vi.mock("@/lib/celebrations/earn", () => ({
  earnDailyLoopCelebrations: mocks.earnDailyLoopCelebrations,
}));

import { addSession } from "./actions";

const PASE_VIEJO = "pase-viejo";
const PASE_NUEVO = "pase-nuevo";

type Escritura = { tabla: string; payload: Record<string, unknown>; filtros: Array<[string, unknown]> };

function fakeClient(escrituras: Escritura[]) {
  return {
    auth: { getUser: async () => ({ data: { user: { id: "usuario" } } }) },
    from(tabla: string) {
      const filtros: Array<[string, unknown]> = [];
      const builder: Record<string, unknown> = {
        insert(payload: Record<string, unknown>) {
          escrituras.push({ tabla, payload, filtros });
          return builder;
        },
        update(payload: Record<string, unknown>) {
          escrituras.push({ tabla, payload, filtros });
          return builder;
        },
        select() {
          return builder;
        },
        eq(col: string, valor: unknown) {
          filtros.push([col, valor]);
          return builder;
        },
        is(col: string, valor: unknown) {
          filtros.push([col, valor]);
          return builder;
        },
        in(col: string, valor: unknown) {
          filtros.push([col, valor]);
          return builder;
        },
        async single() {
          return { data: { id: "sesion-1" }, error: null };
        },
        async maybeSingle() {
          // `books.total_pages` para el tope de página.
          return { data: { total_pages: 300 }, error: null };
        },
        // Las cadenas que terminan sin `.single()` (el update de notas y el de
        // posición) se resuelven al await.
        then(resolve: (v: unknown) => void) {
          resolve({ error: null });
        },
      };
      return builder;
    },
  };
}

function form(campos: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) fd.set(k, v);
  return fd;
}

function escrituraEn(escrituras: Escritura[], tabla: string) {
  return escrituras.find((e) => e.tabla === tabla);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getActivePass.mockResolvedValue({
    id: PASE_VIEJO,
    status: "completed",
    position: { page: 280, format: "paperback" },
    editionId: null,
  });
  mocks.isAutoCloseable.mockResolvedValue(false);
  mocks.getEditions.mockResolvedValue([]);
  mocks.primaryEdition.mockReturnValue(undefined);
  mocks.rollSeriesProgress.mockResolvedValue({ reachedEnd: false });
  mocks.markEpisodeWatched.mockResolvedValue(true);
  mocks.createPost.mockResolvedValue({ ok: true });
  mocks.earnDailyLoopCelebrations.mockResolvedValue(undefined);
});

describe("addSession · la sesión y el cambio de estado son la misma lectura (#717)", () => {
  it("si el estado elegido archiva el pase y crea otro, la sesión se escribe en el NUEVO", async () => {
    mocks.applyTransition.mockResolvedValue({
      kind: "done",
      passId: PASE_NUEVO,
      closed: false,
      created: true,
    });
    const escrituras: Escritura[] = [];
    mocks.createClient.mockResolvedValue(fakeClient(escrituras));

    const res = await addSession(PASE_VIEJO, "book", "libro-1", {}, form({ status: "in_progress", page: "42" }));

    expect(res).toEqual({ ok: true });
    expect(escrituraEn(escrituras, "progress_sessions")?.payload).toMatchObject({
      pass_id: PASE_NUEVO,
    });
  });

  it("el cursor se escribe sobre el pase NUEVO y desde cero, no arrastra la página del viejo", async () => {
    mocks.applyTransition.mockResolvedValue({
      kind: "done",
      passId: PASE_NUEVO,
      closed: false,
      created: true,
    });
    const escrituras: Escritura[] = [];
    mocks.createClient.mockResolvedValue(fakeClient(escrituras));

    await addSession(PASE_VIEJO, "book", "libro-1", {}, form({ status: "in_progress", page: "42" }));

    const cursor = escrituraEn(escrituras, "passes");
    // La posición del pase viejo era { page: 280, format: "paperback" }. Una
    // relectura empieza a cero: solo la página de esta sesión.
    expect(cursor?.payload).toEqual({ position: { page: 42 } });
    expect(cursor?.filtros).toContainEqual(["id", PASE_NUEVO]);
  });

  it("las notas se buscan por el pase viejo (donde se escribieron) y se repuntan al nuevo", async () => {
    mocks.applyTransition.mockResolvedValue({
      kind: "done",
      passId: PASE_NUEVO,
      closed: false,
      created: true,
    });
    const escrituras: Escritura[] = [];
    mocks.createClient.mockResolvedValue(fakeClient(escrituras));

    const fd = form({ status: "in_progress", page: "42" });
    fd.append("noteIds", "nota-1");
    await addSession(PASE_VIEJO, "book", "libro-1", {}, fd);

    const notas = escrituraEn(escrituras, "notes");
    expect(notas?.payload).toMatchObject({ session_id: "sesion-1", pass_id: PASE_NUEVO });
    expect(notas?.filtros).toContainEqual(["pass_id", PASE_VIEJO]);
  });

  it("los episodios se marcan sobre el pase NUEVO", async () => {
    mocks.getActivePass.mockResolvedValue({
      id: PASE_VIEJO,
      status: "completed",
      position: {},
      editionId: null,
    });
    mocks.applyTransition.mockResolvedValue({
      kind: "done",
      passId: PASE_NUEVO,
      closed: false,
      created: true,
    });
    const escrituras: Escritura[] = [];
    mocks.createClient.mockResolvedValue(fakeClient(escrituras));

    const fd = form({ status: "in_progress", season: "2" });
    fd.append("episodes", "3");
    await addSession(PASE_VIEJO, "series", "serie-1", {}, fd);

    expect(mocks.markEpisodeWatched).toHaveBeenCalledWith(
      expect.anything(),
      "usuario",
      "serie-1",
      PASE_NUEVO,
      2,
      3,
    );
    expect(mocks.rollSeriesProgress).toHaveBeenCalledWith(
      expect.anything(),
      "usuario",
      "serie-1",
      PASE_NUEVO,
    );
  });

  it("sin cambio de estado no se mueve nada: todo sigue en el pase de siempre", async () => {
    mocks.getActivePass.mockResolvedValue({
      id: PASE_VIEJO,
      status: "in_progress",
      position: { page: 100, format: "paperback" },
      editionId: null,
    });
    const escrituras: Escritura[] = [];
    mocks.createClient.mockResolvedValue(fakeClient(escrituras));

    await addSession(PASE_VIEJO, "book", "libro-1", {}, form({ status: "in_progress", page: "120" }));

    expect(mocks.applyTransition).not.toHaveBeenCalled();
    expect(escrituraEn(escrituras, "progress_sessions")?.payload).toMatchObject({
      pass_id: PASE_VIEJO,
    });
    // Aquí SÍ se conserva el `format`, que es de esta misma lectura.
    expect(escrituraEn(escrituras, "passes")?.payload).toEqual({
      position: { page: 120, format: "paperback" },
    });
  });

  it("askResume no escribe nada: la sesión se queda en el pase de siempre (#737)", async () => {
    mocks.getActivePass.mockResolvedValue({
      id: PASE_VIEJO,
      status: "dropped",
      position: {},
      editionId: null,
    });
    mocks.applyTransition.mockResolvedValue({ kind: "askResume" });
    const escrituras: Escritura[] = [];
    mocks.createClient.mockResolvedValue(fakeClient(escrituras));

    await addSession(PASE_VIEJO, "book", "libro-1", {}, form({ status: "in_progress", page: "42" }));

    expect(escrituraEn(escrituras, "progress_sessions")?.payload).toMatchObject({
      pass_id: PASE_VIEJO,
    });
  });

  // El riesgo que introduce adelantar la transición: que un formulario inválido
  // cambie el estado antes de rechazarse. Las validaciones van ANTES.
  it("una página inválida se rechaza SIN haber cambiado el estado", async () => {
    const escrituras: Escritura[] = [];
    mocks.createClient.mockResolvedValue(fakeClient(escrituras));

    // 300 es el tope que devuelve el doble para `books.total_pages`.
    const res = await addSession(PASE_VIEJO, "book", "libro-1", {}, form({ status: "in_progress", page: "999" }));

    expect(res).toEqual({ error: "invalidPosition" });
    expect(mocks.applyTransition).not.toHaveBeenCalled();
    expect(escrituraEn(escrituras, "progress_sessions")).toBeUndefined();
  });

  it("el auto-cierre pregunta por el pase VIVO, no por el archivado", async () => {
    mocks.applyTransition.mockResolvedValue({
      kind: "done",
      passId: PASE_NUEVO,
      closed: false,
      created: true,
    });
    mocks.isAutoCloseable.mockResolvedValue(true);
    const escrituras: Escritura[] = [];
    mocks.createClient.mockResolvedValue(fakeClient(escrituras));

    // 300 = el total que devuelve el doble para `books.total_pages`.
    const res = await addSession(PASE_VIEJO, "book", "libro-1", {}, form({ status: "in_progress", page: "300" }));

    expect(mocks.isAutoCloseable).toHaveBeenCalledWith(expect.anything(), PASE_NUEVO, "usuario");
    expect(res).toEqual({ ok: true, passClosed: true });
  });
});
