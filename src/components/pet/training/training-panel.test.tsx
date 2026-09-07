// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../messages/es.json";
import { TrainingPanel } from "./training-panel";
import { pickEnemies, enemyList } from "@/lib/pet/battle/adventure";
import { ENEMIES, RULESET } from "@/lib/pet/battle/content";
import { POLICIES, runPolicy } from "@/lib/pet/battle/policies";
import { snapshotForProfile } from "@/lib/pet/battle/profiles";
import { seedFromIndex } from "@/lib/pet/battle/prng";
import type { TrainingBattle, TrainingResponse } from "@/lib/pet/training/types";

vi.mock("./combat-sprite", () => ({ CombatSprite: () => <div data-testid="combat-sprite" /> }));

vi.mock("@/lib/pet/training/actions", () => ({
  startBattle: vi.fn(async (intentId: string) => ({ ok: true, battle: { intentId, status: "open", seed: "00000001000000020000000300000004", rulesetVersion: "r2.2", enemyId: "brote", snapshot: { name: "Roble", petClass: "wizard", stage: "acorn", attributes: { FUE: 0, CON: 0, INT: 0, SAB: 0, CAR: 0, DES: 0 }, tier: 0, hpMax: 100, atk: 10 } } })),
  resolveBattle: vi.fn(), replayTrainingBattle: vi.fn(),
}));
afterEach(() => { cleanup(); vi.useRealTimers(); });

it("modo entrenamiento: sigue pintando su propio título «Entrenamiento»", () => {
  render(<NextIntlClientProvider locale="es" messages={messages}><TrainingPanel /></NextIntlClientProvider>);
  expect(screen.getByRole("heading", { name: "Entrenamiento" })).toBeTruthy();
});

it("explains manual use, shows recharge and keeps the skill outcome outside the log", async () => {
  vi.useFakeTimers();
  render(<NextIntlClientProvider locale="es" messages={messages}><TrainingPanel /></NextIntlClientProvider>);
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Empezar combate" })); });
  expect(screen.getByText(/se activa al pulsar, nunca sola/).textContent).toContain("6 s");
  fireEvent.click(screen.getByRole("button", { name: "Golpe interruptor · Usar habilidad" }));
  act(() => { vi.advanceTimersByTime(100); });
  expect(screen.getByRole("button", { name: /Golpe interruptor · Recarga:/ }).hasAttribute("disabled")).toBe(true);
  expect(screen.getByTestId("skill-feedback").textContent).toContain("sin interrupción");
  for (let tick = 0; tick < 15; tick++) act(() => { vi.advanceTimersByTime(100); });
  expect(screen.getByTestId("skill-feedback").textContent).toContain("Habilidad:");
});

it("keeps one pet sprite when a skill hits and later ticks replace the motion", async () => {
  vi.useFakeTimers();
  render(<NextIntlClientProvider locale="es" messages={messages}><TrainingPanel /></NextIntlClientProvider>);
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Empezar combate" })); });
  fireEvent.click(screen.getByRole("button", { name: "Golpe interruptor · Usar habilidad" }));
  for (let tick = 0; tick < 25; tick++) act(() => { vi.advanceTimersByTime(100); });
  expect(document.querySelectorAll('[data-mood]')).toHaveLength(1);
  expect(screen.getAllByTestId("combat-sprite")).toHaveLength(1);
});

it("pauses the real component clock and changes speed without adding ticks", async () => {
  vi.useFakeTimers();
  render(<NextIntlClientProvider locale="es" messages={messages}><TrainingPanel /></NextIntlClientProvider>);
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Empezar combate" })); });
  act(() => { vi.advanceTimersByTime(200); });
  expect(screen.getByTestId("training-tick").textContent).toBe("0.2 s");
  fireEvent.click(screen.getByRole("button", { name: "Pausar" }));
  act(() => { vi.advanceTimersByTime(1000); });
  expect(screen.getByTestId("training-tick").textContent).toBe("0.2 s");
  fireEvent.change(screen.getByLabelText("Velocidad"), { target: { value: "2" } });
  expect(screen.getByTestId("training-tick").textContent).toBe("0.2 s");
  fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
  act(() => { vi.advanceTimersByTime(100); });
  expect(screen.getByTestId("training-tick").textContent).toBe("0.4 s");
});

it("returns keyboard focus after cancelling and confirming the ulti", async () => {
  vi.useFakeTimers();
  const { startBattle } = await import("@/lib/pet/training/actions");
  const original = await startBattle("focus");
  if (!original.ok) throw new Error(original.code);
  vi.mocked(startBattle).mockResolvedValueOnce({...original, battle: {...original.battle, rulesetVersion:"r3.1",enemyId:"caparazon"}});
  render(<NextIntlClientProvider locale="es" messages={messages}><TrainingPanel /></NextIntlClientProvider>);
  await act(async () => { fireEvent.click(screen.getByRole("button", { name:"Empezar combate" })); });
  act(() => { vi.advanceTimersByTime(12000); });
  fireEvent.click(screen.getByRole("button", {name:"Preparar ulti"}));
  expect(document.activeElement).toBe(screen.getByRole("button",{name:"Ficha 1"}));
  fireEvent.click(screen.getByRole("button",{name:"Cancelar"}));
  expect(document.activeElement).toBe(screen.getByRole("button",{name:"Preparar ulti"}));
  fireEvent.click(screen.getByRole("button",{name:"Preparar ulti"}));
  fireEvent.click(screen.getByRole("button",{name:"Saltar · daño base"}));
  act(() => { vi.advanceTimersByTime(100); });
  expect(document.activeElement).toBe(screen.getByRole("button",{name:"Golpe interruptor · Usar habilidad"}));
});

function chainFixture() {
  const snapshot = snapshotForProfile("lectora_larga", "wizard");
  for (let i = 0; i < 100; i++) {
    const seed = seedFromIndex(i);
    const enemies = pickEnemies(seed, RULESET.adventure.chainLength, ENEMIES);
    const { inputs, events } = runPolicy({ seed, snapshot, enemies, ruleset: RULESET }, POLICIES.interrupt);
    const ended = events.find((e) => e.type === "FIGHT_ENDED");
    if (ended) return { seed, snapshot, enemyId: enemyList(enemies), inputs, endedTick: ended.tick };
  }
  throw new Error("sin cadena que supere el primer tramo");
}

it("modo aventura: marcador de tramo estable, interludio con Continuar y botón de reintento al perder", async () => {
  vi.useFakeTimers();
  const f = chainFixture();
  const battle: TrainingBattle = { intentId: "adv-1", status: "open", seed: f.seed, snapshot: f.snapshot, rulesetVersion: RULESET.version, contentHash: "x", enemyId: f.enemyId, inputs: [], result: null, digest: null, adventure: { day: "2026-09-07", attempt: 1, reward: null } };
  const actions = { start: vi.fn(async (): Promise<TrainingResponse> => ({ ok: true, battle })), resolve: vi.fn(), replay: vi.fn() };
  render(<NextIntlClientProvider locale="es" messages={messages}><TrainingPanel kind="adventure" actions={actions} startLabel="start" /></NextIntlClientProvider>);
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Empezar aventura" })); });
  expect(screen.getByTestId("fight-marker").textContent).toBe("Tramo 1 de 3");
  expect(screen.queryByLabelText(/Elige un rival/)).toBeNull();
  const skill = () => fireEvent.click(screen.getByRole("button", { name: "Golpe interruptor · Usar habilidad" }));
  for (let tick = 0; tick <= f.endedTick; tick++) {
    if (f.inputs.some((x) => x.tick === tick)) skill();
    act(() => { vi.advanceTimersByTime(100); });
  }
  expect(screen.getByTestId("fight-marker").textContent).toBe("Tramo 2 de 3");
  const cont = screen.getByRole("button", { name: "Continuar" });
  const before = screen.getByTestId("training-tick").textContent;
  act(() => { vi.advanceTimersByTime(500); });
  expect(screen.getByTestId("training-tick").textContent).toBe(before);
  fireEvent.click(cont);
  act(() => { vi.advanceTimersByTime(100); });
  expect(screen.getByTestId("training-tick").textContent).not.toBe(before);
});

it("modo aventura: al ganar muestra el botín y su etiqueta de pendiente", async () => {
  const battle: TrainingBattle = { intentId: "adv-2", status: "resolved", seed: seedFromIndex(1), snapshot: snapshotForProfile("social", "bard"), rulesetVersion: RULESET.version, contentHash: "x", enemyId: "brote,brote,brote", inputs: [], result: { outcome: "win", reason: "ko", ticks: 900, petHp: 10, petHpMax: 100, enemyHp: 0, enemyHpMax: 400, damageDealt: 1200, damageTaken: 90, causes: ["charges_interrupted"], fight: 3 }, digest: "d", adventure: { day: "2026-09-07", attempt: 2, reward: { itemId: "loan_pendant", slot: "amulet" } } };
  const actions = { start: vi.fn(async (): Promise<TrainingResponse> => ({ ok: true, battle, events: [] })), resolve: vi.fn(), replay: vi.fn() };
  render(<NextIntlClientProvider locale="es" messages={messages}><TrainingPanel kind="adventure" actions={actions} startLabel="resume" /></NextIntlClientProvider>);
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Reanudar aventura" })); });
  expect(screen.getByText("¡Aventura superada!")).toBeTruthy();
  expect(screen.getByText("Botín: Colgante del préstamo")).toBeTruthy();
  expect(screen.getByText("Se activa en la siguiente actualización")).toBeTruthy();
});

it("modo aventura: tras ganar, con canStartAnother, hay botón para empezar la siguiente aventura", async () => {
  const battle: TrainingBattle = { intentId: "adv-win-1", status: "resolved", seed: seedFromIndex(1), snapshot: snapshotForProfile("social", "bard"), rulesetVersion: RULESET.version, contentHash: "x", enemyId: "brote,brote,brote", inputs: [], result: { outcome: "win", reason: "ko", ticks: 900, petHp: 10, petHpMax: 100, enemyHp: 0, enemyHpMax: 400, damageDealt: 1200, damageTaken: 90, causes: ["charges_interrupted"], fight: 3 }, digest: "d", adventure: { day: "2026-09-07", attempt: 1, reward: null } };
  const nextBattle: TrainingBattle = { ...battle, intentId: "adv-win-2" };
  const actions = { start: vi.fn(async (): Promise<TrainingResponse> => ({ ok: true, battle, events: [] })), resolve: vi.fn(), replay: vi.fn() };
  render(<NextIntlClientProvider locale="es" messages={messages}><TrainingPanel kind="adventure" actions={actions} startLabel="start" canStartAnother /></NextIntlClientProvider>);
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Empezar aventura" })); });
  expect(screen.getByText("¡Aventura superada!")).toBeTruthy();
  actions.start.mockResolvedValueOnce({ ok: true, battle: nextBattle, events: [] });
  const startButtons = screen.getAllByRole("button", { name: "Empezar aventura" });
  expect(startButtons).toHaveLength(1);
  await act(async () => { fireEvent.click(startButtons[0]); });
  expect(actions.start).toHaveBeenCalledTimes(2);
});

it("modo aventura: tras ganar, sin canStartAnother, no hay botón para la siguiente aventura", async () => {
  const battle: TrainingBattle = { intentId: "adv-win-3", status: "resolved", seed: seedFromIndex(1), snapshot: snapshotForProfile("social", "bard"), rulesetVersion: RULESET.version, contentHash: "x", enemyId: "brote,brote,brote", inputs: [], result: { outcome: "win", reason: "ko", ticks: 900, petHp: 10, petHpMax: 100, enemyHp: 0, enemyHpMax: 400, damageDealt: 1200, damageTaken: 90, causes: ["charges_interrupted"], fight: 3 }, digest: "d", adventure: { day: "2026-09-07", attempt: 1, reward: null } };
  const actions = { start: vi.fn(async (): Promise<TrainingResponse> => ({ ok: true, battle, events: [] })), resolve: vi.fn(), replay: vi.fn() };
  render(<NextIntlClientProvider locale="es" messages={messages}><TrainingPanel kind="adventure" actions={actions} startLabel="start" canStartAnother={false} /></NextIntlClientProvider>);
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Empezar aventura" })); });
  expect(screen.getByText("¡Aventura superada!")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Empezar aventura" })).toBeNull();
});

function singleFightFixture() {
  const snapshot = snapshotForProfile("lectora_larga", "wizard");
  for (let i = 0; i < 50; i++) {
    const seed = seedFromIndex(i);
    const enemies = [ENEMIES.brote];
    const { inputs, events, result } = runPolicy({ seed, snapshot, enemies, ruleset: RULESET }, POLICIES.interrupt);
    const ended = events.find((e) => e.type === "BATTLE_ENDED");
    if (ended) return { seed, snapshot, enemyId: enemyList(enemies), inputs, endedTick: ended.tick, result };
  }
  throw new Error("sin combate que termine dentro de 50 seeds");
}

it("onDone se dispara una sola vez por combate terminado, con la última prop onDone vigente", async () => {
  vi.useFakeTimers();
  const f = singleFightFixture();
  const lostBattle: TrainingBattle = {
    intentId: "adv-onDone-1", status: "resolved", seed: f.seed, snapshot: f.snapshot,
    rulesetVersion: RULESET.version, contentHash: "x", enemyId: f.enemyId, inputs: [],
    result: { outcome: "lose", reason: "ko", ticks: 10, petHp: 0, petHpMax: 100, enemyHp: 50, enemyHpMax: 100, damageDealt: 10, damageTaken: 100, causes: [], fight: 1 },
    digest: "d1", adventure: { day: "2026-09-07", attempt: 1, reward: null },
  };
  const openBattle: TrainingBattle = {
    intentId: "adv-onDone-2", status: "open", seed: f.seed, snapshot: f.snapshot,
    rulesetVersion: RULESET.version, contentHash: "x", enemyId: f.enemyId, inputs: [],
    result: null, digest: null, adventure: { day: "2026-09-07", attempt: 2, reward: null },
  };
  const resolvedBattle: TrainingBattle = { ...openBattle, status: "resolved", result: f.result, digest: "d2" };
  const onDone1 = vi.fn();
  const actions = {
    start: vi.fn()
      .mockResolvedValueOnce({ ok: true, battle: lostBattle } satisfies TrainingResponse)
      .mockResolvedValueOnce({ ok: true, battle: openBattle } satisfies TrainingResponse),
    resolve: vi.fn(async (): Promise<TrainingResponse> => ({ ok: true, battle: resolvedBattle, events: [] })),
    replay: vi.fn(),
  };
  const { rerender } = render(<NextIntlClientProvider locale="es" messages={messages}><TrainingPanel kind="adventure" actions={actions} onDone={onDone1} /></NextIntlClientProvider>);
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Empezar aventura" })); });
  expect(onDone1).toHaveBeenCalledTimes(1);

  const onDone2 = vi.fn();
  rerender(<NextIntlClientProvider locale="es" messages={messages}><TrainingPanel kind="adventure" actions={actions} onDone={onDone2} /></NextIntlClientProvider>);
  expect(onDone1).toHaveBeenCalledTimes(1);
  expect(onDone2).toHaveBeenCalledTimes(0);

  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Reintentar aventura" })); });
  for (let tick = 0; tick <= f.endedTick; tick++) {
    if (f.inputs.some((x) => x.tick === tick)) fireEvent.click(screen.getByRole("button", { name: "Golpe interruptor · Usar habilidad" }));
    act(() => { vi.advanceTimersByTime(100); });
  }
  await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });

  expect(onDone2).toHaveBeenCalledTimes(1);
  expect(onDone1).toHaveBeenCalledTimes(1);
});
