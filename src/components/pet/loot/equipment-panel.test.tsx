// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../messages/es.json";
import { EquipmentPanel } from "./equipment-panel";
import type { LootCopy, LoadoutResponse, PetLoadout } from "@/lib/pet/loot/types";
vi.mock("@/lib/pet/loot/actions", () => ({ equipLoot: vi.fn() }));
afterEach(cleanup);
const a: LootCopy = { copyId: "a", itemId: "sharp_bookmark", slot: "weapon", qualityBp: 8000, acquiredAt: "2026-09-07T12:00:00Z" };
const b: LootCopy = { ...a, copyId: "b", qualityBp: 12000, acquiredAt: "2026-09-08T12:00:00Z" };
function view(props: Partial<Parameters<typeof EquipmentPanel>[0]> = {}) {
  return <NextIntlClientProvider locale="es" timeZone="Europe/Madrid" messages={messages}><EquipmentPanel copies={[a,b]} initialLoadout={{ weapon:a, amulet:null }} hasOpenAdventure {...props} /></NextIntlClientProvider>;
}
it("compares two distinct copies and saves only on explicit equip, then can clear the slot", async () => {
  const save = vi.fn().mockResolvedValueOnce({ ok:true, loadout:{ weapon:b, amulet:null } }).mockResolvedValueOnce({ ok:true, loadout:{ weapon:null, amulet:null } });
  render(view({ onEquip:save }));
  const grid = screen.getByTestId("loot-weapon");
  const copyButtons = within(grid).getAllByRole("button");
  expect(copyButtons).toHaveLength(2);
  expect(grid.querySelector("details")).toBeNull();
  fireEvent.click(copyButtons[1]);
  expect(copyButtons[1].getAttribute("aria-pressed")).toBe("true");
  expect(save).not.toHaveBeenCalled();
  fireEvent.click(copyButtons[0]);
  expect(copyButtons[0].getAttribute("aria-pressed")).toBe("true");
  const comparison = screen.getByTestId("loot-comparison");
  expect(within(comparison).getByText("Potencia ×0,8")).toBeTruthy();
  expect(within(comparison).getByText("Potencia ×1,2")).toBeTruthy();
  expect(within(comparison).getByText("Conseguido el 8 sept 2026")).toBeTruthy();
  expect(save).not.toHaveBeenCalled();
  await act(async () => fireEvent.click(within(comparison).getByRole("button", {name:"Equipar para el próximo combate"})));
  expect(save).toHaveBeenCalledWith("weapon", "b");
  expect(within(screen.getByTestId("equipped-weapon")).getByText("Potencia ×1,2")).toBeTruthy();
  await act(async () => fireEvent.click(screen.getByRole("button", {name:"Quitar arma"})));
  expect(save).toHaveBeenLastCalledWith("weapon", null);
  expect(within(screen.getByTestId("equipped-weapon")).getByText("Sin equipar")).toBeTruthy();
});
it("blocks concurrent writes, retains the displayed selection on error, and accepts refreshed props", async () => {
  let finish!: (response:LoadoutResponse)=>void;
  const save = vi.fn(() => new Promise<LoadoutResponse>(resolve => {finish=resolve;}));
  const rendered=render(view({onEquip:save, suggestedCopyId:"b"}));
  const equip=screen.getByRole("button", {name:"Equipar para el próximo combate"});
  fireEvent.click(equip); fireEvent.click(equip);
  expect(save).toHaveBeenCalledTimes(1);
  expect(equip.hasAttribute("disabled")).toBe(true);
  await act(async()=>finish({ok:false,code:"UNAVAILABLE"}));
  expect(within(screen.getByTestId("equipped-weapon")).getByText("Potencia ×0,8")).toBeTruthy();
  expect(screen.getByRole("status").textContent).toContain("Vuelve a intentarlo");
  const fresh:PetLoadout={weapon:b,amulet:null};
  rendered.rerender(view({onEquip:save,initialLoadout:fresh}));
  expect(within(screen.getByTestId("equipped-weapon")).getByText("Potencia ×1,2")).toBeTruthy();
});
it("suggests a newly won copy without automatically equipping it", () => {
  const save=vi.fn();
  render(view({onEquip:save,suggestedCopyId:"b"}));
  expect(screen.getByTestId("loot-comparison")).toBeTruthy();
  expect(save).not.toHaveBeenCalled();
});
it("keeps every duplicate selectable even when potency and acquisition date match", () => {
  const save = vi.fn();
  render(view({ copies: [a, { ...a, copyId: "duplicate" }], onEquip: save }));
  const buttons = within(screen.getByTestId("loot-weapon")).getAllByRole("button");
  expect(buttons).toHaveLength(2);
  fireEvent.click(buttons[1]);
  expect(buttons[1].getAttribute("aria-pressed")).toBe("true");
  expect(buttons[0].getAttribute("aria-pressed")).toBe("false");
  expect(screen.getByRole("button", { name: "Equipar para el próximo combate" }).hasAttribute("disabled")).toBe(false);
  fireEvent.click(buttons[0]);
  expect(buttons[0].getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByRole("button", { name: "Equipar para el próximo combate" }).hasAttribute("disabled")).toBe(true);
  expect(save).not.toHaveBeenCalled();
});
it("lets a user compare another copy after a suggestion and selects newly suggested loot", () => {
  const save = vi.fn();
  const rendered = render(view({ suggestedCopyId: "b", onEquip: save }));
  const buttons = within(screen.getByTestId("loot-weapon")).getAllByRole("button");
  fireEvent.click(buttons[1]);
  expect(buttons[1].getAttribute("aria-pressed")).toBe("true");
  rendered.rerender(view({ suggestedCopyId: "b", onEquip: save }));
  expect(buttons[1].getAttribute("aria-pressed")).toBe("true");
  const c = { ...b, copyId: "new-loot" };
  rendered.rerender(view({ copies: [a, b, c], suggestedCopyId: c.copyId, onEquip: save }));
  const selected = within(screen.getByTestId("loot-weapon")).getAllByRole("button").filter(button => button.getAttribute("aria-pressed") === "true");
  expect(selected).toHaveLength(1);
  expect(selected[0].closest("li")?.getAttribute("data-copy")).toBe(c.copyId);
  expect(save).not.toHaveBeenCalled();
});
it("renders both empty slots and no equip action for an empty inventory", () => {
  render(view({ copies: [], initialLoadout: { weapon: null, amulet: null } }));
  expect(within(screen.getByTestId("equipped-weapon")).getByText("Sin equipar")).toBeTruthy();
  expect(within(screen.getByTestId("equipped-amulet")).getByText("Sin equipar")).toBeTruthy();
  expect(screen.queryByTestId("loot-comparison")).toBeNull();
  expect(screen.queryByRole("button", { name: "Equipar para el próximo combate" })).toBeNull();
});
