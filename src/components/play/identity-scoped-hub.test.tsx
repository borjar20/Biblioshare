// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import type { PlayerRecord, SavedGameRecord } from "@/lib/play/core/db";
import messages from "../../../messages/es.json";

const savedA: SavedGameRecord = {
  gameId: "g-a", identity: "A", v: 2, committed: [],
  deletedAt: null, savedAt: 0, syncStatus: "synced",
  summary: {
    toolId: "score",
    tool: { gameName: "Partida A", totals: [], target: null },
    winners: [], participants: [], ranking: [], durationMs: 0,
  },
};
const playerA: PlayerRecord = {
  playerId: "p-a", identity: "A", v: 1, name: "Ana",
  deletedAt: null, syncStatus: "synced",
};
const playerB: PlayerRecord = { ...playerA, playerId: "p-b", identity: "B", name: "Beto" };
let resolveSavedB: ((value: SavedGameRecord[]) => void) | undefined;
let resolvePlayersB: ((value: PlayerRecord[]) => void) | undefined;

vi.mock("@/lib/play/core/db", () => ({
  listSaved: (identity: string) => {
    if (identity === "A") return Promise.resolve([savedA]);
    if (identity === "anon") return Promise.resolve([]);
    return new Promise<SavedGameRecord[]>((resolve) => { resolveSavedB = resolve; });
  },
  listPlayers: (identity: string) => identity === "A"
    ? Promise.resolve([playerA])
    : new Promise<PlayerRecord[]>((resolve) => { resolvePlayersB = resolve; }),
  deleteSaved: vi.fn(), saveFinished: vi.fn(), putPlayer: vi.fn(),
}));
vi.mock("@/lib/play/core/sync", () => ({
  SAVED_CHANNEL_PREFIX: "saved:", requestSavedSync: vi.fn(),
}));
vi.mock("@/lib/play/core/players-sync", () => ({
  PLAYERS_CHANNEL_PREFIX: "players:", requestPlayersSync: vi.fn(),
}));
import { IdentityScopedHub } from "./identity-scoped-hub";

beforeEach(() => {
  resolveSavedB = undefined;
  resolvePlayersB = undefined;
  vi.stubGlobal("BroadcastChannel", class {
    onmessage = null;
    close() {}
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function hub(identity: string) {
  return (
    <NextIntlClientProvider locale="es" messages={messages}>
      <IdentityScopedHub identity={identity} />
    </NextIntlClientProvider>
  );
}

describe("IdentityScopedHub", () => {
  it("no enseña el historial de A mientras B carga", async () => {
    const view = render(hub("A"));
    await screen.findByText("Partida A");
    view.rerender(hub("B"));
    expect(screen.queryByText("Partida A")).toBeNull();
    await act(async () => { resolveSavedB?.([]); });
  });

  it("no enseña los habituales de A mientras B carga", async () => {
    const view = render(hub("A"));
    await screen.findByText(/1 jugador/);
    view.rerender(hub("B"));
    expect(screen.queryByText(/1 jugador/)).toBeNull();
    await act(async () => { resolvePlayersB?.([playerB]); });
    await screen.findByText(/1 jugador/);
  });
});