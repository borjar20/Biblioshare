// @vitest-environment jsdom
import type { CSSProperties } from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../messages/es.json";
import { PetGame } from "./pet-game";
import { EMPTY_COUNTS } from "@/lib/pet/counts";
import type { PetSnapshot } from "@/lib/pet/get-pet-snapshot";
import type { AdventureState } from "@/lib/pet/adventure/types";
import type { ShopState } from "@/lib/pet/shop/types";
import { petReturnKey, petViewKey } from "@/lib/pet/game-navigation";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router, useSearchParams: () => new URLSearchParams(window.location.search) }));
vi.mock("@/lib/pet/adventure/actions", () => ({ startAdventure: vi.fn(), resolveAdventure: vi.fn(), replayAdventure: vi.fn(), resumeAdventure: vi.fn() }));
vi.mock("@/lib/pet/loot/actions", () => ({ equipLoot: vi.fn() }));
vi.mock("@/lib/celebrations/preference", () => ({ checkCelebrations: vi.fn() }));
// El módulo real de la tienda arrastra `server-only` (vía repository.ts): sin
// este mock, el simple import de ShopPanel revienta el test, igual que en
// shop-panel.test.tsx.
vi.mock("@/lib/pet/shop/actions", () => ({ claimAcorns: vi.fn(), buyCosmetic: vi.fn(), setCampScene: vi.fn() }));
vi.mock("../training/training-panel", () => ({ TrainingPanel: ({ kind = "training", active }: { kind?: string; active: boolean }) => <div data-testid={kind} data-active={String(active)} /> }));
vi.mock("../loot/equipment-panel", () => ({ EquipmentPanel: () => <div>Equipment</div> }));
vi.mock("../mission-board", () => ({ MissionBoard: () => <div>Missions</div> }));
vi.mock("../achievement-grid", () => ({ AchievementGrid: () => <div>Achievements</div> }));
vi.mock("../pet-detail", () => ({ PetDetail: () => <div>Character</div> }));
// La escena se mockea a bajo nivel, no a fuera: pinta las mismas variables CSS
// que el componente real para que un test pueda comprobar qué fondo llegó.
vi.mock("./pet-hud", () => ({
  PetHud: () => <div>HUD</div>,
  PetScene: ({ scene }: { scene?: { file: string; width: number; height: number } | null }) =>
    <div data-testid="pet-scene" style={scene ? {
      "--scene-src": `url('/pet/scenes/${scene.file}')`,
      "--scene-w": String(scene.width),
      "--scene-h": String(scene.height),
    } as CSSProperties : undefined}>Scene</div>,
}));

const pet: PetSnapshot = {
  name: "Nuez", petClass: "wizard", hatchedAt: "2026-09-01T00:00:00Z", hidden: false,
  counts: EMPTY_COUNTS, attributes: { FUE: 0, CON: 0, INT: 0, SAB: 0, CAR: 0, DES: 0 },
  xp: 0, level: 1, levelFloorXp: 0, nextLevelXp: 100, stage: "acorn", mood: "happy",
  lastActivityISO: null, leveledUp: false, evolved: false, missions: [], achievements: [],
  missionsCompletedNow: false, achievementsUnlockedNow: false,
};
const adventure: AdventureState = { pendingDays: ["2026-09-09"], current: null, inventory: [], loadout: { weapon: null, amulet: null } };
function game(userId = "alice", snapshot = pet, shop: ShopState | null = null) {
  return <NextIntlClientProvider locale="es" messages={messages}><PetGame userId={userId} pet={snapshot} adventure={adventure} shop={shop} burrow={<div>Burrow</div>} /></NextIntlClientProvider>;
}
beforeEach(() => { sessionStorage.clear(); window.history.replaceState(null, "", "/mascota"); vi.clearAllMocks(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it("falls back to camp for an unknown explicit view, overriding the remembered screen", () => {
  sessionStorage.setItem(petViewKey("alice"), "diary");
  window.history.replaceState(null, "", "/mascota?view=unknown");
  render(game());
  expect(screen.getByTestId("pet-game").getAttribute("data-view")).toBe("camp");
  expect(screen.getByRole("button", { name: "Campamento" }).getAttribute("aria-current")).toBe("page");
  expect(sessionStorage.getItem(petViewKey("alice"))).toBe("camp");
});

it("sends the retired bag view to the character sheet, where the equipment now lives", () => {
  // La Mochila dejó de ser destino en #1166. Los enlaces compartidos y la vista
  // recordada de sesiones anteriores tienen que seguir llegando a alguna parte.
  window.history.replaceState(null, "", "/mascota?view=bag");
  render(game());
  expect(screen.getByTestId("pet-game").getAttribute("data-view")).toBe("character");
  expect(screen.getByRole("button", { name: "Personaje" }).getAttribute("aria-current")).toBe("page");
  expect(screen.queryByRole("button", { name: "Mochila" })).toBeNull();
});

it("uses native history for tabs, preserves other query parameters and focuses restored views", async () => {
  window.history.replaceState(null, "", "/mascota?source=companion&view=camp");
  const { rerender } = render(game());
  const training = screen.getByTestId("training");
  const push = vi.spyOn(window.history, "pushState");
  fireEvent.click(screen.getByRole("button", { name: "Diario" }));
  expect(push).toHaveBeenCalledWith(null, "", "/mascota?source=companion&view=diary");
  // Next's useSearchParams publishes this native-history change; render its new snapshot.
  rerender(game());
  expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Diario", level: 1 }));
  expect(screen.getByTestId("training")).toBe(training);
  window.history.replaceState(null, "", "/mascota?view=character");
  act(() => { window.dispatchEvent(new PopStateEvent("popstate")); });
  rerender(game());
  expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Personaje", level: 1 }));
  expect(router.push).not.toHaveBeenCalled();
  const actions = await import("@/lib/pet/adventure/actions");
  expect(actions.startAdventure).not.toHaveBeenCalled();
});

it("restores only this user's remembered screen and return location", () => {
  sessionStorage.setItem(petViewKey("alice"), "diary");
  sessionStorage.setItem(petReturnKey("alice"), "/coleccion?type=book");
  const { unmount } = render(game());
  expect(window.location.search).toBe("?view=diary");
  expect(screen.getByRole("link", { name: "Biblioshare" }).getAttribute("href")).toBe("/coleccion?type=book");
  unmount();
  window.history.replaceState(null, "", "/mascota");
  render(game("bob"));
  expect(screen.getByTestId("pet-game").getAttribute("data-view")).toBe("camp");
  expect(screen.getByRole("link", { name: "Biblioshare" }).getAttribute("href")).toBe("/");
  expect(sessionStorage.getItem(petViewKey("alice"))).toBe("diary");
});

it("keeps navigation usable when session storage is blocked and rejects unsafe returns", () => {
  sessionStorage.setItem(petReturnKey("alice"), "//external.example/path");
  const { unmount } = render(game());
  expect(screen.getByRole("link", { name: "Biblioshare" }).getAttribute("href")).toBe("/");
  unmount();
  vi.spyOn(window, "sessionStorage", "get").mockImplementation(() => { throw new DOMException("Blocked", "SecurityError"); });
  render(game());
  fireEvent.click(screen.getByRole("button", { name: "Personaje" }));
  expect(window.location.search).toBe("?view=character");
});

it("respects a failed combat checkpoint when cancelling exit, and leaves after confirmation", () => {
  window.history.replaceState(null, "", "/mascota?view=training");
  render(game());
  const veto = (event: Event) => event.preventDefault();
  window.addEventListener("pet:before-leave", veto);
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  try {
    fireEvent.click(screen.getByRole("link", { name: "Biblioshare" }));
    fireEvent.click(screen.getByRole("button", { name: "Campamento" }));
    expect(router.push).not.toHaveBeenCalled();
    expect(window.location.search).toBe("?view=training");
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole("link", { name: "Biblioshare" }));
    expect(router.push).toHaveBeenCalledWith("/");
  } finally { window.removeEventListener("pet:before-leave", veto); }
});

it.each(["camp", "character", "training", "adventure"])("only activates the visible combat panel in %s", view => {
  window.history.replaceState(null, "", `/mascota?view=${view}`);
  render(game());
  expect(screen.getByTestId("training").getAttribute("data-active")).toBe(String(view === "training"));
  expect(screen.getByTestId("adventure").getAttribute("data-active")).toBe(String(view === "adventure"));
  expect(Boolean(screen.queryByRole("navigation"))).toBe(view !== "training" && view !== "adventure");
  expect(screen.getByRole("link", { name: "Biblioshare" })).toBeTruthy();
});

it("derives the mission summary from actual completion flags, including zero completed", () => {
  const missions: PetSnapshot["missions"] = [0, 1, 2].map(slot => ({ slot, template: "session_minutes", target: 1, xp: 10, progress: 0, completed: false, itemType: null, itemId: null, title: null }));
  const { rerender } = render(game("alice", { ...pet, missions }));
  expect(screen.getByText("0 de 3 completadas")).toBeTruthy();
  rerender(game("alice", { ...pet, missions: missions.map((mission, index) => ({ ...mission, completed: index === 0 })) }));
  expect(screen.getByText("1 de 3 completadas")).toBeTruthy();
});

it("does not request the same celebration again when changing screens", async () => {
  const { checkCelebrations } = await import("@/lib/celebrations/preference");
  const snapshot = { ...pet, missionsCompletedNow: true };
  const { rerender } = render(game("alice", snapshot));
  expect(checkCelebrations).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: "Diario" }));
  rerender(game("alice", snapshot));
  expect(checkCelebrations).toHaveBeenCalledOnce();
});

it("abre el puesto sin salir del campamento y pinta el fondo comprado", () => {
  render(game("alice", pet, { balance: 0, pending: [], owned: ["creek"], scene: "creek" }));
  // La escena elegida manda sobre la de siempre: «creek» trae su propio fichero.
  expect(screen.getByTestId("pet-scene").style.getPropertyValue("--scene-src")).toContain("camp-creek.webp");
  fireEvent.click(screen.getByRole("button", { name: "Ir al puesto" }));
  expect(screen.getByTestId("pet-shop")).toBeTruthy();
  // El puesto no es un destino: la barra sigue con cuatro botones.
  expect(within(screen.getByRole("navigation", { name: "Navegación de la mascota" })).getAllByRole("button")).toHaveLength(4);
  fireEvent.click(screen.getByRole("button", { name: "Cerrar el puesto" }));
  expect(screen.queryByTestId("pet-shop")).toBeNull();
});

it("mueve el foco al puesto al abrirlo y lo devuelve al botón al cerrarlo", () => {
  render(game("alice", pet, { balance: 0, pending: [], owned: ["creek"], scene: "creek" }));
  const openButton = screen.getByRole("button", { name: "Ir al puesto" });
  fireEvent.click(openButton);
  // Sin esto el foco se queda en el botón «Ir al puesto», que el puesto tapa.
  expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Puesto del claro", level: 3 }));
  fireEvent.click(screen.getByRole("button", { name: "Cerrar el puesto" }));
  // El botón que tenía el foco (el «Cerrar») se desmonta con el puesto: sin
  // devolverlo a mano cae a `body`.
  expect(document.activeElement).toBe(openButton);
});
