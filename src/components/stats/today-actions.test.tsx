// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TodayActions, type TodayActionsLabels } from "./today-actions";

// Componente cliente: fuera del App Router `useRouter` no tiene contexto. Aquí
// no se prueba la navegación —solo QUÉ botones salen—, así que basta un doble.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
// Los server actions no se llegan a invocar (nadie pulsa), pero importarlos de
// verdad arrastra el cliente de Supabase al bundle de test.
vi.mock("@/lib/library/manage-actions", () => ({ updateStatus: vi.fn() }));
vi.mock("@/lib/series/episode-actions", () => ({ setEpisodeWatched: vi.fn() }));

// Sin `globals: true`, testing-library no limpia sola y cada render se acumula
// en el mismo body: un "no aparece" vería los restos del test anterior.
afterEach(cleanup);

const LABELS: TodayActionsLabels = {
  session: "Sesión",
  log: "Registrar",
  cancel: "Cancelar",
  register: "Registrar",
  notes: "+ Nota",
  timerLabel: "Tiempo de esta sesión",
  nextEpisode: "T1 · E2",
  markSeen: "Marcar Vista",
  markDone: "Marcar terminada",
};

function renderActions(props: Partial<Parameters<typeof TodayActions>[0]> = {}) {
  return render(
    <TodayActions
      passId="p1"
      itemType="book"
      itemId="i1"
      seriesId="i1"
      nextEpisode={null}
      reachedEnd={false}
      sessionHref="/sesion/p1"
      logHref="/libro/i1?tab=log"
      labels={LABELS}
      {...props}
    />,
  );
}

// El hallazgo: la tarjeta destacada anunciaba el final del pase y sus dos
// únicas acciones eran «Sesión» y «Registrar» — la respuesta más probable, «lo
// he terminado», no tenía botón.
describe("TodayActions · salida al terminar", () => {
  it("libro a medias: cronómetro y registrar, sin salida a terminar", () => {
    renderActions();
    expect(screen.getByText("Sesión")).toBeTruthy();
    expect(screen.getByText("Registrar")).toBeTruthy();
    expect(screen.queryByText("Marcar terminada")).toBeNull();
  });

  it("libro en su última página: aparece «Marcar terminada» y se va el cronómetro", () => {
    renderActions({ reachedEnd: true });
    expect(screen.getByText("Marcar terminada")).toBeTruthy();
    // Un libro en su última página no necesita reloj: la acción por tipo cede
    // el hueco en vez de amontonar tres botones en una fila de 390 px.
    expect(screen.queryByText("Sesión")).toBeNull();
    expect(screen.getByText("Registrar")).toBeTruthy();
  });

  it("serie sin episodios que marcar: la salida también aparece", () => {
    renderActions({ itemType: "series", nextEpisode: null, reachedEnd: true });
    expect(screen.getByText("Marcar terminada")).toBeTruthy();
  });

  it("serie con episodio pendiente: manda marcar el episodio, no terminar", () => {
    renderActions({
      itemType: "series",
      nextEpisode: { season: 1, episode: 2 },
      reachedEnd: false,
    });
    expect(screen.getByText("T1 · E2")).toBeTruthy();
    expect(screen.queryByText("Marcar terminada")).toBeNull();
  });

  it("película: sigue con su «Marcar Vista» y nunca duplica salida", () => {
    renderActions({ itemType: "movie", reachedEnd: true, sessionHref: null });
    expect(screen.getByText("Marcar Vista")).toBeTruthy();
    expect(screen.queryByText("Marcar terminada")).toBeNull();
  });

  it("sin pase no hay nada que cerrar", () => {
    renderActions({ passId: null, sessionHref: null, reachedEnd: true });
    expect(screen.queryByText("Marcar terminada")).toBeNull();
    expect(screen.getByText("Registrar")).toBeTruthy();
  });
});
