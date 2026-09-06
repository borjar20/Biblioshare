// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../messages/es.json";
import { TrainingPanel } from "./training-panel";

vi.mock("@/lib/pet/training/actions", () => ({
  startBattle: vi.fn(async (intentId: string) => ({ ok: true, battle: { intentId, status: "open", seed: "00000001000000020000000300000004", rulesetVersion: "r2.2", enemyId: "brote", snapshot: { name: "Roble", petClass: "wizard", stage: "acorn", attributes: { FUE: 0, CON: 0, INT: 0, SAB: 0, CAR: 0, DES: 0 }, tier: 0, hpMax: 100, atk: 10 } } })),
  resolveBattle: vi.fn(), replayTrainingBattle: vi.fn(),
}));
afterEach(() => { cleanup(); vi.useRealTimers(); });

it("explains manual use, shows recharge and keeps the skill outcome outside the log", async () => {
  vi.useFakeTimers();
  render(<NextIntlClientProvider locale="es" messages={messages}><TrainingPanel /></NextIntlClientProvider>);
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Empezar combate" })); });
  expect(screen.getByText(/se activa al pulsar, nunca sola/).textContent).toContain("6 s");
  fireEvent.click(screen.getByRole("button", { name: "Golpe interruptor · Usar habilidad" }));
  act(() => { vi.advanceTimersByTime(100); });
  expect(screen.getByRole("button", { name: /Golpe interruptor · Recarga:/ }).hasAttribute("disabled")).toBe(true);
  expect(screen.getByTestId("skill-feedback").textContent).toContain("No había una carga que interrumpir");
  for (let tick = 0; tick < 15; tick++) act(() => { vi.advanceTimersByTime(100); });
  expect(screen.getByTestId("skill-feedback").textContent).toContain("Última habilidad:");
});

it("keeps one pet sprite when a skill hits and later ticks replace the motion", async () => {
  vi.useFakeTimers();
  render(<NextIntlClientProvider locale="es" messages={messages}><TrainingPanel /></NextIntlClientProvider>);
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Empezar combate" })); });
  fireEvent.click(screen.getByRole("button", { name: "Golpe interruptor · Usar habilidad" }));
  for (let tick = 0; tick < 25; tick++) act(() => { vi.advanceTimersByTime(100); });
  expect(document.querySelectorAll('[data-mood]')).toHaveLength(1);
  expect(screen.getAllByText("• •")).toHaveLength(1);
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
