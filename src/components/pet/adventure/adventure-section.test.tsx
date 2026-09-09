// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../messages/es.json";
import { AdventurePanel } from "./adventure-panel";
import { RULESET } from "@/lib/pet/battle/content";
import { BATTLE_RELEASES } from "@/lib/pet/battle/replay";
const CURRENT_HASH=BATTLE_RELEASES.find(release=>release.rulesetVersion===RULESET.version)!.contentHash;
import { snapshotForProfile } from "@/lib/pet/battle/profiles";
import { seedFromIndex } from "@/lib/pet/battle/prng";
import type { AdventureBattle, AdventureState } from "@/lib/pet/adventure/types";

vi.mock("../training/combat-sprite", () => ({ CombatSprite: () => <div data-testid="combat-sprite" /> }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/pet/loot/actions", () => ({ equipLoot: vi.fn() }));
vi.mock("@/lib/pet/adventure/actions", () => ({
  startAdventure: vi.fn(), resolveAdventure: vi.fn(), replayAdventure: vi.fn(),
}));
// TrainingPanel importa las acciones de entrenamiento a nivel de módulo (fallback sin `actions`
// prop); sin este mock arrastraría "@/lib/pet/training/repository" y su `import "server-only"`.
vi.mock("@/lib/pet/training/actions", () => ({
  startBattle: vi.fn(), resolveBattle: vi.fn(), replayTrainingBattle: vi.fn(),
}));

afterEach(() => { cleanup(); });

function renderPanel(initial: Omit<AdventureState, "loadout">) {
  return render(<NextIntlClientProvider locale="es" timeZone="Europe/Madrid" messages={messages}><AdventurePanel initial={{ ...initial, loadout: { weapon: null, amulet: null } }} /></NextIntlClientProvider>);
}

it("con aventura pendiente y sin actual: cuenta, botón de empezar e inventario", () => {
  renderPanel({
    pendingDays: ["2026-09-07"],
    current: null,
    inventory: [{ copyId: "copy-a", itemId: "sharp_bookmark", slot: "weapon", qualityBp: 12000, acquiredAt: "2026-09-07T00:00:00Z" }],
  });
  expect(screen.getByTestId("adventure-pending").textContent).toBe("1 aventura pendiente");
  expect(screen.getByRole("button", { name: "Empezar aventura" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /Comparar · Marcapáginas afilado/ }));
  expect(screen.getByTestId("loot-comparison").textContent).toContain("Potencia ×1,2");
});

it("sin aventuras pendientes ni actual: mensaje de ninguna y botón deshabilitado", () => {
  renderPanel({ pendingDays: [], current: null, inventory: [] });
  expect(screen.getByText("Registra algo hoy y vuelve: tu mascota tendrá una aventura esperando.")).toBeTruthy();
  // El panel sigue montado (spec §8): el botón existe deshabilitado, no desaparece.
  expect(screen.getByRole("button", { name: "Empezar aventura" }).hasAttribute("disabled")).toBe(true);
  expect(screen.queryByRole("button", { name: "Reanudar aventura" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Reintentar aventura" })).toBeNull();
});

it("no duplica el título «Aventuras»: TrainingPanel en modo aventura no pinta su propio encabezado", () => {
  renderPanel({
    pendingDays: ["2026-09-07"],
    current: null,
    inventory: [],
  });
  expect(screen.queryByRole("heading", { name: "Aventuras" })).toBeNull();
  expect(screen.getByRole("button", { name: "Empezar aventura" })).toBeTruthy();
});

it("la pantalla de victoria sobrevive al router.refresh() con un solo día pendiente", async () => {
  const { startAdventure } = await import("@/lib/pet/adventure/actions");
  const won: AdventureBattle = {
    intentId: "adv-refresh", status: "resolved", seed: seedFromIndex(1),
    snapshot: snapshotForProfile("social", "bard"), rulesetVersion: RULESET.version, contentHash: CURRENT_HASH,
    enemyId: "brote,brote,brote", inputs: [],
    result: { outcome: "win", reason: "ko", ticks: 900, petHp: 10, petHpMax: 100, enemyHp: 0, enemyHpMax: 400, damageDealt: 1200, damageTaken: 90, causes: ["charges_interrupted"], fight: 3 },
    digest: "d", adventure: { day: "2026-09-07", attempt: 1, reward: { itemId: "loan_pendant", slot: "amulet" } },
  };
  vi.mocked(startAdventure).mockResolvedValue({ ok: true, battle: won, events: [] });

  const { rerender } = renderPanel({ pendingDays: ["2026-09-07"], current: null, inventory: [] });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Empezar aventura" })); });
  expect(screen.getByText("¡Aventura superada!")).toBeTruthy();

  // Lo que produce el router.refresh() posterior a ganar: ya no queda día pendiente.
  const after: AdventureState = { pendingDays: [], current: null, loadout: { weapon: null, amulet: null }, inventory: [{ copyId: "copy-b", itemId: "loan_pendant", slot: "amulet", qualityBp: 10000, acquiredAt: "2026-09-07T00:00:00Z" }] };
  rerender(<NextIntlClientProvider locale="es" messages={messages}><AdventurePanel initial={after} /></NextIntlClientProvider>);
  expect(screen.getByText("¡Aventura superada!")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Empezar aventura" })).toBeNull();
});
