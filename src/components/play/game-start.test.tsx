// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetDbForTests,
  listSaved,
  readActive,
  saveFinished,
  type SavedGameRecord,
} from "@/lib/play/core/db";
import { makeEvent } from "@/lib/play/core/events";
import { replay } from "@/lib/play/core/replay";
import {
  __resetPlayStoresForTests,
  getPlayStore,
  type PlayStoreWithTestHooks,
} from "@/lib/play/core/store";
import type { ToolId } from "@/lib/play/core/types";
import { makeSetup, started } from "@/lib/play/mtg/test-fixtures";
import { buildSavedSummary, playTools } from "@/lib/play/tools";
import {
  __resetTableSnapshotsForTests,
  rememberTable,
  tableMemoryKey,
} from "@/lib/play/ui/table-memory";
import { PREFERENCES_KEY } from "@/lib/play/ui/preferences";
import messages from "../../../messages/es.json";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(),
}));
// La identidad y el store son reales. Los habituales remotos no participan
// en el contrato de arranque; evitar su red deja el rechazo determinista.
vi.mock("@/lib/play/core/use-players", () => ({
  usePlayers: () => ({ players: [], loaded: true }),
}));

import { MtgModeChooser } from "./mtg-mode-chooser";
import { RememberedTableCard } from "./remembered-table-card";
import { SetupForm } from "./setup-form";
import { ScorePresetChooser } from "./score/score-preset-chooser";
import { ScoreSetupForm } from "./score/score-setup-form";

const CALLERS: {
  name: string;
  toolId: ToolId;
  button: string;
  view: (identity: string) => ReactNode;
}[] = [
  {
    name: "configuración de Magic",
    toolId: "mtg",
    button: messages.play.setup.start,
    view: (identity) => <SetupForm identity={identity} />,
  },
  {
    name: "selector de Magic",
    toolId: "mtg",
    button: messages.play.tools.mtg.playNow,
    view: (identity) => <MtgModeChooser identity={identity} />,
  },
  {
    name: "mesa recordada",
    toolId: "mtg",
    button: messages.play.rememberedTable.play,
    view: (identity) => <RememberedTableCard identity={identity} />,
  },
  {
    name: "selector de Puntuación",
    toolId: "score",
    button: messages.play.tools.score.playNow,
    view: (identity) => <ScorePresetChooser identity={identity} />,
  },
  {
    name: "configuración de Puntuación",
    toolId: "score",
    button: messages.play.setup.start,
    view: (identity) => <ScoreSetupForm identity={identity} />,
  },
];

beforeEach(async () => {
  await __resetPlayStoresForTests();
  vi.stubGlobal("indexedDB", new IDBFactory());
  vi.stubGlobal("BroadcastChannel", undefined);
  await __resetDbForTests();
  localStorage.clear();
  __resetTableSnapshotsForTests();
  push.mockClear();
});

afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  await __resetPlayStoresForTests();
  vi.unstubAllGlobals();
});

async function oldGame(identity: string) {
  const store = getPlayStore(identity) as PlayStoreWithTestHooks;
  await vi.waitFor(() => expect(store.getSnapshot().status).toBe("ready"));
  expect(store.start(started(1000))).toBe(true);
  expect(store.tap(makeEvent("life_changed", { target: "ana", delta: -3 }, 2000, "old-life"))).toBe(true);
  store.flush();
  await store.__drainWritesForTests();

  const savedLog = [
    started(100),
    makeEvent("game_finished", { winner: "ana", reason: "last_standing" }, 200, "saved-finish"),
  ];
  const saved: SavedGameRecord = {
    gameId: savedLog[0].id,
    identity,
    v: 2,
    committed: savedLog,
    savedAt: 300,
    summary: buildSavedSummary(replay(savedLog)),
    syncStatus: "synced",
    deletedAt: null,
  };
  expect(await saveFinished(saved)).toBe(true);
  rememberTable(identity, makeSetup(["Mesa anterior", "Otro asiento"]));
  localStorage.setItem(PREFERENCES_KEY, JSON.stringify({ orientation: "landscape", layout: "head", keepAwake: false }));

  return {
    store,
    snapshot: store.getSnapshot(),
    record: await readActive(identity),
    saved,
    table: localStorage.getItem(tableMemoryKey(identity)),
    preferences: localStorage.getItem(PREFERENCES_KEY),
  };
}

describe.each(CALLERS)("$name", ({ toolId, button, view }) => {
  it.each(["anon", "uid-964"])("conserva %s si el reducer rechaza el setup candidato", async (identity) => {
    const old = await oldGame(identity);
    render(<NextIntlClientProvider locale="es" messages={messages}>{view(identity)}</NextIntlClientProvider>);
    const notified = vi.fn();
    old.store.subscribe(notified);

    // El caller genera su candidato normalmente. En esta frontera se introduce
    // un setup no jugable y se conserva el init REAL: es el reducer quien lo
    // rechaza, no un mock que devuelve false sin validar la partida.
    const init = playTools[toolId].init;
    const initSpy = vi.spyOn(playTools[toolId], "init").mockImplementation((event) => {
      const payload = event.payload as { setup: object };
      return init({ ...event, payload: { ...payload, setup: { ...payload.setup, participants: [] } } });
    });
    fireEvent.click(screen.getByRole("button", { name: button }));
    await act(async () => { await old.store.__drainWritesForTests(); });

    expect(initSpy).toHaveBeenCalledTimes(1);
    expect(old.store.getSnapshot()).toBe(old.snapshot);
    expect(await readActive(identity)).toEqual(old.record);
    expect(notified).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    expect(localStorage.getItem(tableMemoryKey(identity))).toBe(old.table);
    expect(localStorage.getItem(PREFERENCES_KEY)).toBe(old.preferences);
    expect(await listSaved(identity)).toEqual([old.saved]);
    expect(await readActive(identity === "anon" ? "uid-964" : "anon")).toEqual({ ok: true, record: null });
  });

  it.each(["anon", "uid-964"])("reemplaza %s en un solo commit cuando el setup es válido", async (identity) => {
    const old = await oldGame(identity);
    render(<NextIntlClientProvider locale="es" messages={messages}>{view(identity)}</NextIntlClientProvider>);
    const notified = vi.fn();
    old.store.subscribe(notified);

    fireEvent.click(screen.getByRole("button", { name: button }));
    await act(async () => { await old.store.__drainWritesForTests(); });

    const current = old.store.getSnapshot();
    expect(current.game?.state.toolId).toBe(toolId);
    expect(current.game?.log.pending).toBeNull();
    expect(current.game?.log.committed).toHaveLength(1);
    expect(current.game?.log.committed[0].id).not.toBe(old.snapshot.game?.log.committed[0].id);
    expect(notified).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledExactlyOnceWith("/partida/activa");
    expect(await readActive(identity)).toEqual({
      ok: true,
      record: {
        identity,
        v: 1,
        rev: old.record.ok && old.record.record ? old.record.record.rev + 1 : -1,
        committed: current.game?.log.committed,
        pending: null,
      },
    });
    if (toolId === "mtg") {
      expect(JSON.parse(localStorage.getItem(tableMemoryKey(identity))!).setup).toEqual(current.game?.state.setup);
    } else {
      expect(localStorage.getItem(tableMemoryKey(identity))).toBe(old.table);
    }
    expect(localStorage.getItem(PREFERENCES_KEY)).toBe(old.preferences);
    expect(await listSaved(identity)).toEqual([old.saved]);
  });
});
