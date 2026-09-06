import { beforeEach, describe, expect, it, vi } from "vitest";

// #824 — El hito social lo publica la MÁQUINA, no cada llamador.
//
// Antes lo publicaba un único llamador (`updateStatus`, el segmentado de la
// ficha) y los otros tres caminos que cierran un pase se olvidaban: el
// auto-cierre al llegar a la última página, el Select de estado de la hoja de
// sesión y el último episodio de una serie. Sin post no hay tarjeta, así que la
// reseña que el usuario escribía a continuación no llegaba al feed de nadie —
// y como las películas solo se cierran desde la ficha, parecía que el fallo era
// "de los libros".
//
// Estos casos fijan el CONTRATO del ejecutor. Quién llama a la máquina y con qué
// intención se cubre en los tests de cada llamador.

const mocks = vi.hoisted(() => ({
  getActivePass: vi.fn(),
  maybeAutopostMilestone: vi.fn(),
}));

vi.mock("./get-passes", () => ({ getActivePass: mocks.getActivePass }));
vi.mock("@/lib/social/autopost", () => ({
  maybeAutopostMilestone: mocks.maybeAutopostMilestone,
}));

import { applyTransition } from "./apply-transition";

// Cliente mínimo: la máquina solo hace update/insert sobre `passes`. El insert
// termina en `.select("id").single()`; el update se resuelve al await.
function fakeClient() {
  const builder: Record<string, unknown> = {
    update: () => builder,
    insert: () => builder,
    select: () => builder,
    eq: () => builder,
    single: async () => ({ data: { id: "pase-nuevo" }, error: null }),
    then: (resolve: (v: unknown) => void) => resolve({ error: null }),
  };
  return { from: () => builder } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.maybeAutopostMilestone.mockResolvedValue(undefined);
});

describe("applyTransition publica el hito por defecto", () => {
  it("no escribe ni publica si no se pudo leer el pase activo (#657)", async () => {
    mocks.getActivePass.mockRejectedValueOnce(new Error("Could not load passes"));
    const from = vi.fn();
    await expect(applyTransition({ from } as never, "u", "book", "b", "in_progress"))
      .rejects.toThrow("Could not load passes");
    expect(from).not.toHaveBeenCalled();
    expect(mocks.maybeAutopostMilestone).not.toHaveBeenCalled();
  });

  it("pase abierto que se cierra (completed) => publica con closed:true", async () => {
    mocks.getActivePass.mockResolvedValue({ id: "pase-1", status: "in_progress" });

    const outcome = await applyTransition(fakeClient(), "usuario", "book", "libro-1", "completed");

    expect(outcome).toMatchObject({ kind: "done", passId: "pase-1", closed: true });
    expect(mocks.maybeAutopostMilestone).toHaveBeenCalledTimes(1);
    expect(mocks.maybeAutopostMilestone.mock.calls[0][1]).toMatchObject({
      userId: "usuario",
      passId: "pase-1",
      itemType: "book",
      itemId: "libro-1",
      to: "completed",
      closed: true,
      created: false,
    });
  });

  it("obra sin pase que nace cerrada (película vista) => publica con created:true", async () => {
    mocks.getActivePass.mockResolvedValue(null);

    const outcome = await applyTransition(fakeClient(), "usuario", "movie", "peli-1", "completed");

    expect(outcome).toMatchObject({ kind: "done", passId: "pase-nuevo", closed: true, created: true });
    expect(mocks.maybeAutopostMilestone.mock.calls[0][1]).toMatchObject({
      to: "completed",
      closed: true,
      created: true,
    });
  });

  it("no publica si la máquina no decide nada (askResume)", async () => {
    // Abandonado → leyendo sin `resume`: la máquina no puede elegir sola, no
    // escribe nada. Publicar un hito de algo que no ha pasado sería mentir.
    mocks.getActivePass.mockResolvedValue({ id: "pase-1", status: "dropped" });

    const outcome = await applyTransition(fakeClient(), "usuario", "book", "libro-1", "in_progress");

    expect(outcome).toEqual({ kind: "askResume" });
    expect(mocks.maybeAutopostMilestone).not.toHaveBeenCalled();
  });

  it("`silent` calla el hito: es la salida de las acciones administrativas", async () => {
    mocks.getActivePass.mockResolvedValue({ id: "pase-1", status: "in_progress" });

    await applyTransition(
      fakeClient(), "usuario", "book", "libro-1", "completed", undefined, { silent: true },
    );

    expect(mocks.maybeAutopostMilestone).not.toHaveBeenCalled();
  });

  it("el defecto es PUBLICAR: sin opciones, publica", async () => {
    // El sentido del defecto es la mitad del arreglo. Si fuera al revés, un
    // llamador nuevo que se olvidase de la bandera callaría en silencio — que es
    // exactamente cómo se perdieron tres caminos durante meses.
    mocks.getActivePass.mockResolvedValue({ id: "pase-1", status: "planned" });

    await applyTransition(fakeClient(), "usuario", "book", "libro-1", "in_progress");

    expect(mocks.maybeAutopostMilestone).toHaveBeenCalledTimes(1);
  });
});
