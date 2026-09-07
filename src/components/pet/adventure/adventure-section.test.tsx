// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../messages/es.json";
import { AdventurePanel } from "./adventure-panel";
import type { AdventureState } from "@/lib/pet/adventure/types";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/pet/adventure/actions", () => ({
  startAdventure: vi.fn(), resolveAdventure: vi.fn(), replayAdventure: vi.fn(),
}));
// TrainingPanel importa las acciones de entrenamiento a nivel de módulo (fallback sin `actions`
// prop); sin este mock arrastraría "@/lib/pet/training/repository" y su `import "server-only"`.
vi.mock("@/lib/pet/training/actions", () => ({
  startBattle: vi.fn(), resolveBattle: vi.fn(), replayTrainingBattle: vi.fn(),
}));

afterEach(() => { cleanup(); });

function renderPanel(initial: AdventureState) {
  render(<NextIntlClientProvider locale="es" messages={messages}><AdventurePanel initial={initial} /></NextIntlClientProvider>);
}

it("con aventura pendiente y sin actual: cuenta, botón de empezar e inventario", () => {
  renderPanel({
    pendingDays: ["2026-09-07"],
    current: null,
    inventory: [{ itemId: "sharp_bookmark", slot: "weapon", count: 2 }],
  });
  expect(screen.getByTestId("adventure-pending").textContent).toBe("1 aventura pendiente");
  expect(screen.getByRole("button", { name: "Empezar aventura" })).toBeTruthy();
  expect(screen.getByText("Marcapáginas afilado")).toBeTruthy();
  expect(screen.getByText("×2")).toBeTruthy();
});

it("sin aventuras pendientes ni actual: mensaje de ninguna y sin botón", () => {
  renderPanel({ pendingDays: [], current: null, inventory: [] });
  expect(screen.getByText("Registra algo hoy y vuelve: tu mascota tendrá una aventura esperando.")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Empezar aventura" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Reanudar aventura" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Reintentar aventura" })).toBeNull();
});
