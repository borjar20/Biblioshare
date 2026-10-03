// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../messages/es.json";
import { makeEvent } from "@/lib/play/core/events";
import { replay } from "@/lib/play/core/replay";
import type { PlayerRecord } from "@/lib/play/core/db";
import type { ActiveGame, PlayStore, PlayStoreSnapshot } from "@/lib/play/core/store";
import type { Participant, PlayEvent } from "@/lib/play/core/types";
import type { GameStartedEvent } from "@/lib/play/score/events";
import { initialScoreState } from "@/lib/play/score/reducer";
import type { ScoreSetup } from "@/lib/play/score/types";
import { started as mtgStarted } from "@/lib/play/mtg/test-fixtures";

// Solo fronteras: router y lecturas/persistencia. Los hooks de suscripción,
// el formulario, sus controles, las traducciones y el replay son reales.
const boundary = vi.hoisted(() => {
  let snapshot: PlayStoreSnapshot = { status: "loading", game: null };
  const listeners = new Set<() => void>();
  return {
    query: new URLSearchParams(),
    players: [] as PlayerRecord[],
    push: vi.fn(),
    store: {
      getSnapshot: () => snapshot,
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => { listeners.delete(listener); };
      },
      start: vi.fn<PlayStore["start"]>(() => true),
    },
    publish(next: PlayStoreSnapshot) {
      snapshot = next;
      listeners.forEach((listener) => listener());
    },
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: boundary.push }),
  useSearchParams: () => boundary.query,
}));
vi.mock("@/lib/play/core/store", () => ({ getPlayStore: () => boundary.store }));
vi.mock("@/lib/play/core/db", () => ({
  listSaved: async () => [],
  listPlayers: async () => boundary.players,
  putPlayer: async () => false,
}));
vi.mock("@/lib/play/core/players-sync", () => ({
  PLAYERS_CHANNEL_PREFIX: "score965-test:",
  requestPlayersSync: vi.fn(),
}));

import { ScoreSetupForm } from "./score-setup-form";

const IDENTITY = "user-score965";
const sourceParticipants: Participant[] = [
  { id: "old-ana", kind: "user", name: "Ana", userId: IDENTITY },
  { id: "old-beto", kind: "regular", name: "Beto", playerId: "regular-beto-965" },
  { id: "old-celia", kind: "guest", name: "Celia" },
];
const rematchParticipants: Participant[] = [
  { id: "p1", kind: "user", name: "Ana", userId: IDENTITY },
  { id: "p2", kind: "regular", name: "Beto", playerId: "regular-beto-965" },
  { id: "p3", kind: "guest", name: "Celia" },
];

function scoreGame(setup: Partial<ScoreSetup> = {}, finished = true): ActiveGame {
  const committed: PlayEvent[] = [
    makeEvent("game_started", {
      toolId: "score" as const,
      setup: { participants: sourceParticipants, direction: "lowest", ...setup },
    }, 1000, "score965-started"),
    makeEvent("round_scored", { scores: [7, 4, 2] }, 2000, "score965-scored"),
  ];
  if (finished) committed.push(makeEvent("game_finished", { reason: "manual" }, 3000, "score965-finished"));
  return { log: { committed, pending: null }, state: replay(committed) };
}

async function renderForm() {
  await act(async () => {
    render(
      <NextIntlClientProvider locale="es" messages={messages}>
        <ScoreSetupForm identity={IDENTITY} selfName="Ana" />
      </NextIntlClientProvider>,
    );
  });
}

async function hydrate(game: ActiveGame | null) {
  await act(async () => boundary.publish({ status: "ready", game }));
}

function submittedSetup(): ScoreSetup {
  expect(boundary.store.start).toHaveBeenCalledTimes(1);
  const [event, options] = boundary.store.start.mock.calls[0];
  expect(event.type).toBe("game_started");
  expect(options).toEqual({ replaceActive: true });
  const started = event as GameStartedEvent;
  expect(started.payload.toolId).toBe("score");
  // Además de inspeccionar el comando de la frontera, el motor real acepta
  // la nueva partida y no arrastra las rondas de la anterior.
  const state = initialScoreState(started);
  expect(state.status).toBe("active");
  expect(state.rounds).toEqual([]);
  expect(boundary.push).toHaveBeenCalledWith("/partida/activa");
  return started.payload.setup;
}

beforeEach(() => {
  boundary.publish({ status: "loading", game: null });
  boundary.query = new URLSearchParams();
  boundary.store.start.mockClear();
  boundary.push.mockClear();
  boundary.players = [{
    playerId: "regular-beto-965", identity: IDENTITY, v: 1,
    name: "Beto", syncStatus: "synced", deletedAt: null,
  }];
});
afterEach(cleanup);

describe("ScoreSetupForm — prefill de revancha", () => {
  it("lee la mesa terminada cuando se hidrata después del primer render y conserva todas sus opciones", async () => {
    boundary.query = new URLSearchParams("revancha=1&preset=rondas&jugadores=8&n=99");
    await renderForm();

    const start = screen.getByRole("button", { name: "Empezar" });
    expect((start as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getAllByRole("button", { name: /^Editar a Jugador / })).toHaveLength(8);
    fireEvent.click(start);
    expect(boundary.store.start).not.toHaveBeenCalled();

    await hydrate(scoreGame({ target: { kind: "points", value: 37 }, gameName: "Chinchón" }));

    expect((start as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getAllByRole("button", { name: /^Editar a / })).toHaveLength(3);
    for (const name of ["Ana", "Beto", "Celia"]) {
      fireEvent.click(screen.getByRole("button", { name: `Editar a ${name}` }));
      expect((screen.getByLabelText("Nombre") as HTMLInputElement).value).toBe(name);
    }
    expect(screen.getByRole("button", { name: "El que menos suma" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Puntos" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByLabelText("Valor del límite").textContent).toBe("37");
    expect(screen.getByRole("button", { name: "Chinchón" }).getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(start);
    expect(submittedSetup()).toEqual({
      participants: rematchParticipants, direction: "lowest",
      target: { kind: "points", value: 37 }, gameName: "Chinchón",
    });
  });

  it("permite editar la mesa prefijada ya hidratada de una reconfiguración activa", async () => {
    boundary.query = new URLSearchParams("reconfigurar=1");
    boundary.publish({
      status: "ready",
      game: scoreGame({ direction: "highest", target: { kind: "rounds", value: 13 }, gameName: "UNO" }, false),
    });
    await renderForm();

    expect(screen.getByRole("button", { name: "El que más suma" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Rondas" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByLabelText("Valor del límite").textContent).toBe("13");
    fireEvent.click(screen.getByRole("button", { name: "Editar a Beto" }));
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Bea" } });
    fireEvent.click(screen.getByRole("button", { name: "El que menos suma" }));
    fireEvent.click(screen.getByRole("button", { name: "Subir límite" }));
    fireEvent.click(screen.getByRole("button", { name: "Otro juego" }));
    fireEvent.change(screen.getByRole("textbox", { name: "¿A qué jugáis?" }), { target: { value: "Dominó" } });
    fireEvent.click(screen.getByRole("button", { name: "Empezar" }));

    expect(submittedSetup()).toEqual({
      participants: [rematchParticipants[0], { id: "p2", kind: "guest", name: "Bea" }, rematchParticipants[2]],
      direction: "lowest", target: { kind: "rounds", value: 14 }, gameName: "Dominó",
    });
  });

  it("una revancha sin límite ni etiqueta prevalece sobre el preset de la URL", async () => {
    boundary.query = new URLSearchParams("revancha=1&preset=puntos&jugadores=8&n=45");
    await renderForm();
    await hydrate(scoreGame());

    expect(screen.getByRole("button", { name: "Libre" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByLabelText("Valor del límite")).toBeNull();
    expect(screen.queryByRole("textbox", { name: "¿A qué jugáis?" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Empezar" }));

    expect(submittedSetup()).toEqual({
      participants: rematchParticipants, direction: "lowest", target: undefined, gameName: undefined,
    });
  });

  it.each(["vacía", "Magic"])("usa el preset cuando la partida hidratada es %s", async (source) => {
    boundary.query = new URLSearchParams("revancha=1&preset=puntos&jugadores=2&n=45");
    await renderForm();
    const committed = [mtgStarted()];
    const game = source === "vacía" ? null : { log: { committed, pending: null }, state: replay(committed) };
    await hydrate(game);

    expect(screen.getAllByRole("button", { name: /^Editar a Jugador / })).toHaveLength(2);
    expect(screen.getByLabelText("Valor del límite").textContent).toBe("45");
    fireEvent.click(screen.getByRole("button", { name: "Empezar" }));

    expect(submittedSetup()).toEqual({
      participants: [
        { id: "p1", kind: "guest", name: "Jugador 1" },
        { id: "p2", kind: "guest", name: "Jugador 2" },
      ],
      direction: "highest", target: { kind: "points", value: 45 }, gameName: undefined,
    });
  });

  it("una configuración nueva no se prerrellena desde otra partida de puntuación", async () => {
    boundary.query = new URLSearchParams("preset=rondas&jugadores=2&n=6");
    await renderForm();
    await hydrate(scoreGame({ target: { kind: "points", value: 37 }, gameName: "Chinchón" }));

    expect(screen.getAllByRole("button", { name: /^Editar a Jugador / })).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Editar a Ana" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Empezar" }));

    expect(submittedSetup()).toEqual({
      participants: [
        { id: "p1", kind: "guest", name: "Jugador 1" },
        { id: "p2", kind: "guest", name: "Jugador 2" },
      ],
      direction: "highest", target: { kind: "rounds", value: 6 }, gameName: undefined,
    });
  });
});
