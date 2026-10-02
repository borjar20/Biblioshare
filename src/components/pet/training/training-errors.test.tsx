// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../messages/es.json";
import { TrainingPanel } from "./training-panel";
import type { TrainingBattle, TrainingResponse } from "@/lib/pet/training/types";

vi.mock("./combat-sprite", () => ({ CombatSprite: () => <div /> }));
vi.mock("@/lib/pet/training/actions", () => ({ startBattle: vi.fn(), resolveBattle: vi.fn(), replayTrainingBattle: vi.fn() }));
afterEach(() => { cleanup(); vi.useRealTimers(); });

const battle: TrainingBattle = {
  intentId: "one", status: "open", seed: "00000001000000020000000300000004",
  rulesetVersion: "r2.2", contentHash: "2c40a90c9f141ffd2eda8241c83eb8859a712dbe4606798b56b90fb056b159d3", enemyId: "brote",
  inputs: [], result: null, digest: null,
  snapshot: { name: "Roble", petClass: "wizard", stage: "acorn", attributes: { FUE: 0, CON: 0, INT: 0, SAB: 0, CAR: 0, DES: 0 }, tier: 1, hpMax: 100, atk: 10 },
};
function actionsFor(code: string) {
  return {
    start: vi.fn<(intentId: string, enemyId?: string) => Promise<TrainingResponse>>(async intentId => ({ ok: true, battle: { ...battle, intentId } }))
      .mockResolvedValueOnce({ ok: false, code }),
    resolve: vi.fn(async (): Promise<TrainingResponse> => ({ ok: false, code })),
    replay: vi.fn(async (): Promise<TrainingResponse> => ({ ok: false, code })),
  };
}
function mount(actions: ReturnType<typeof actionsFor>, extra: Partial<React.ComponentProps<typeof TrainingPanel>> = {}) {
  render(<NextIntlClientProvider locale="es" messages={messages}><TrainingPanel actions={actions} {...extra} /></NextIntlClientProvider>);
}
async function click(name: string) {
  await act(async () => { fireEvent.click(screen.getByRole("button", { name })); });
}

it.each(["NETWORK", "UNAVAILABLE"])("explains %s and retries the same selected combat", async code => {
  const actions = actionsFor(code);
  mount(actions);
  fireEvent.click(screen.getByRole("radio", { name: messages.pet.training.enemies.caparazon }));
  await click("Empezar combate");
  expect(screen.getByRole("alert").textContent).toContain("No hay conexión con el servidor.");
  await click("Reintentar el mismo combate");
  expect(actions.start.mock.calls[1]).toEqual(actions.start.mock.calls[0]);
  expect(actions.start.mock.calls[0][1]).toBe("caparazon");
});

it.each(["training", "adventure"] as const)("offers login instead of another unauthenticated %s request", async kind => {
  const actions = actionsFor("UNAUTHENTICATED");
  mount(actions, { kind });
  await click(kind === "training" ? "Empezar combate" : "Empezar aventura");
  expect(screen.getByRole("alert").textContent).toContain("Tu sesión ha caducado.");
  const link = screen.getByRole("link", { name: "Volver a entrar" });
  expect(link.getAttribute("href")).toBe(`/login?next=${encodeURIComponent(`/mascota?view=${kind}`)}`);
  expect(screen.queryByRole("button", { name: /Reintentar/ })).toBeNull();
  expect(actions.start).toHaveBeenCalledOnce();
});

it.each(["UNKNOWN_RELEASE", "INVALID_SNAPSHOT", "UNSUPPORTED_BATTLE"])("starts a fresh training only after explicit choice for %s", async code => {
  const saved = new Map([
    ["pet-training:alice:current", JSON.stringify({ intent: "old" })],
    ["pet-training:alice:old", JSON.stringify({ tick: 3, inputs: [] })],
  ]);
  const storage = { getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, value: string) => { saved.set(key, value); }, removeItem: (key: string) => { saved.delete(key); } };
  const actions = actionsFor(code);
  mount(actions, { userId: "alice", storage });
  await click("Continuar");
  expect(screen.getByRole("alert").textContent).toContain("Este combate no es compatible con la versión actual.");
  expect(saved.get("pet-training:alice:current")).toBe(JSON.stringify({ intent: "old" }));
  expect(saved.get("pet-training:alice:old")).toBe(JSON.stringify({ tick: 3, inputs: [] }));
  expect(actions.start).toHaveBeenCalledOnce();
  await click("Empezar un combate nuevo");
  const nextIntent = actions.start.mock.calls[1][0];
  expect(nextIntent).not.toBe("old");
  expect(saved.get("pet-training:alice:old")).toBe(JSON.stringify({ tick: 3, inputs: [] }));
  expect(saved.get("pet-training:alice:current")).toBe(JSON.stringify({ intent: nextIntent }));
});

it.each(["NO_PET", "UNKNOWN_ENEMY", "FUTURE_CODE"])("keeps the generic message and same intent for %s", async code => {
  const actions = actionsFor(code);
  mount(actions);
  await click("Empezar combate");
  expect(screen.getByRole("alert").textContent).toBe(messages.pet.training.error);
  await click("Reintentar el mismo combate");
  expect(actions.start.mock.calls[1]).toEqual(actions.start.mock.calls[0]);
});

it("does not replace a recoverable local battle with a fresh start", async () => {
  vi.useFakeTimers();
  const saved = new Map([["pet-training:alice:current", JSON.stringify({ intent: "old" })], ["pet-training:alice:old", "broken-json"]]);
  const storage = { getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, value: string) => { saved.set(key, value); }, removeItem: (key: string) => { saved.delete(key); } };
  const actions = actionsFor("unused");
  actions.start.mockReset().mockImplementation(async intentId => ({ ok: true, battle: { ...battle, intentId } }));
  mount(actions, { userId: "alice", storage });
  await click("Continuar");
  expect(screen.getByRole("alert").textContent).toBe(messages.pet.training.recoveryError);
  expect(screen.queryByRole("button", { name: "Empezar un combate nuevo" })).toBeNull();
  await click("Continuar");
  expect(screen.queryByRole("alert")).toBeNull();
  expect(actions.start).toHaveBeenCalledOnce();
  expect(actions.start.mock.calls[0][0]).toBe("old");
});

it("offers login on failed resolution while retaining the checkpoint and decisions", async () => {
  vi.useFakeTimers();
  const saved = new Map<string, string>();
  const storage = { getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, value: string) => { saved.set(key, value); }, removeItem: (key: string) => { saved.delete(key); } };
  const actions = actionsFor("UNAUTHENTICATED");
  actions.start.mockReset().mockImplementation(async intentId => ({ ok: true, battle: { ...battle, intentId } }));
  mount(actions, { userId: "alice", storage });
  await click("Empezar combate");
  await click("Golpe interruptor · Usar habilidad");
  await act(async () => { vi.advanceTimersByTime(150_000); });
  expect(screen.getByRole("link", { name: "Volver a entrar" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Reintentar guardar el resultado" })).toBeNull();
  const intent = actions.start.mock.calls[0][0];
  expect(saved.get("pet-training:alice:current")).toBe(JSON.stringify({ intent }));
  const log = JSON.parse(saved.get(`pet-training:alice:${intent}`)!);
  expect(log.inputs).toEqual([{ seq: 0, tick: 0, action: "skill", payload: {} }]);
  expect(actions.resolve.mock.calls[0]).toEqual([intent, log.inputs]);
});
