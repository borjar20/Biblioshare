import { beforeEach, describe, expect, it, vi } from "vitest";
import { createShopService } from "./service";
import type { ClaimedEntry, ShopRepository, ShopState } from "./types";

function fakeRepo(initial: Partial<ShopState> = {}) {
  const state: ShopState = { balance: 0, pending: [], owned: [], scene: null, ...initial };
  const claimed: ClaimedEntry[] = [];
  const repo: ShopRepository = {
    state: async () => ({ ...state, pending: [...state.pending], owned: [...state.owned] }),
    claim: async () => {
      const entries = state.pending.map(fact => ({ ...fact, amount: fact.kind === "day" ? 10 : 5 }));
      state.balance += entries.reduce((sum, entry) => sum + entry.amount, 0);
      state.pending = [];
      claimed.push(...entries);
      return entries;
    },
    buy: async (id, price) => {
      if (state.balance < price) throw new Error("NOT_ENOUGH");
      state.balance -= price; state.owned.push(id);
    },
    setScene: async id => {
      if (id !== null && !state.owned.includes(id)) throw new Error("NOT_OWNED");
      state.scene = id;
    },
  };
  return { repo, state, claimed };
}

describe("servicio de la tienda", () => {
  it("devuelve lo recogido y el estado nuevo", async () => {
    const { repo } = fakeRepo({ pending: [{ kind: "day", key: "day:2026-09-11" }] });
    const response = await createShopService(repo).claim();
    expect(response).toMatchObject({ ok: true, entries: [{ key: "day:2026-09-11", amount: 10 }] });
    if (response.ok) expect(response.state.balance).toBe(10);
  });
  it("rechaza un cosmético inventado sin llamar al repositorio", async () => {
    const { repo } = fakeRepo({ balance: 1000 });
    const buy = vi.spyOn(repo, "buy");
    expect(await createShopService(repo).buy("../../secret")).toEqual({ ok: false, code: "UNKNOWN_COSMETIC" });
    expect(buy).not.toHaveBeenCalled();
  });
  it("traduce la falta de saldo a su código", async () => {
    const { repo } = fakeRepo({ balance: 10 });
    expect(await createShopService(repo).buy("creek")).toEqual({ ok: false, code: "NOT_ENOUGH" });
  });
  it("cobra el precio del catálogo, no el que le pasen", async () => {
    const { repo } = fakeRepo({ balance: 100 });
    const buy = vi.spyOn(repo, "buy");
    await createShopService(repo).buy("creek");
    expect(buy).toHaveBeenCalledWith("creek", 100);
  });
  it("volver a la escena de siempre es gratis y no exige tenerla", async () => {
    const { repo } = fakeRepo({ owned: ["creek"], scene: "creek" });
    const response = await createShopService(repo).setScene("camp");
    expect(response).toMatchObject({ ok: true });
    if (response.ok) expect(response.state.scene).toBeNull();
  });
  it("no deja estrenar lo que no se ha comprado", async () => {
    const { repo } = fakeRepo();
    expect(await createShopService(repo).setScene("snow")).toEqual({ ok: false, code: "NOT_OWNED" });
  });
});
