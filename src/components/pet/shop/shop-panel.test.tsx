// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../messages/es.json";
import { ShopPanel } from "./shop-panel";
import type { ShopState } from "@/lib/pet/shop/types";
// El módulo real arrastra `server-only` (vía repository.ts): sin este mock,
// el simple import de ShopPanel revienta el test, igual que en equipment-panel.
vi.mock("@/lib/pet/shop/actions", () => ({ claimAcorns: vi.fn(), buyCosmetic: vi.fn(), setCampScene: vi.fn() }));

afterEach(cleanup);
const base: ShopState = { balance: 120, pending: [], owned: [], scene: null };
function view(state: Partial<ShopState>, actions: Parameters<typeof ShopPanel>[0]["actions"]) {
  return <NextIntlClientProvider locale="es" timeZone="Europe/Madrid" messages={messages}>
    <ShopPanel state={{ ...base, ...state }} onClose={() => {}} actions={actions} />
  </NextIntlClientProvider>;
}

it("recoge y enseña el desglose de lo ingresado", async () => {
  const claim = vi.fn().mockResolvedValue({
    ok: true,
    entries: [{ key: "day:2026-09-11", kind: "day", amount: 10 }, { key: "welcome", kind: "welcome", amount: 50 }],
    state: { ...base, balance: 180, pending: [] },
  });
  render(view({ balance: 120, pending: [{ kind: "day", key: "day:2026-09-11" }, { kind: "welcome", key: "welcome" }] },
    { claim, buy: vi.fn(), setScene: vi.fn() }));
  await act(async () => fireEvent.click(screen.getByRole("button", { name: /Recoger/ })));
  expect(claim).toHaveBeenCalledTimes(1);
  const status = screen.getByRole("status");
  expect(status.textContent).toContain("60");
  expect(status.textContent).toContain("de bienvenida");
  expect(screen.getByTestId("acorn-balance").textContent).toContain("180");
});

it("no ofrece comprar lo que no se puede pagar, y dice cuánto falta", () => {
  render(view({ balance: 10 }, { claim: vi.fn(), buy: vi.fn(), setScene: vi.fn() }));
  const card = screen.getByTestId("scene-creek");
  expect(within(card).getByText("Te faltan 90 bellotas")).toBeTruthy();
  expect(within(card).queryByRole("button", { name: /Comprar/ })).toBeNull();
});

it("compra y deja estrenar lo comprado", async () => {
  const buy = vi.fn().mockResolvedValue({ ok: true, state: { ...base, balance: 20, owned: ["creek"] } });
  const setScene = vi.fn().mockResolvedValue({ ok: true, state: { ...base, balance: 20, owned: ["creek"], scene: "creek" } });
  render(view({ balance: 120 }, { claim: vi.fn(), buy, setScene }));
  await act(async () => fireEvent.click(within(screen.getByTestId("scene-creek")).getByRole("button", { name: /Comprar/ })));
  expect(buy).toHaveBeenCalledWith("creek");
  await act(async () => fireEvent.click(within(screen.getByTestId("scene-creek")).getByRole("button", { name: "Poner este fondo" })));
  expect(setScene).toHaveBeenCalledWith("creek");
  expect(within(screen.getByTestId("scene-creek")).getByText("Puesto ahora")).toBeTruthy();
});

it("el fondo de siempre siempre se puede poner", () => {
  render(view({ owned: ["creek"], scene: "creek" }, { claim: vi.fn(), buy: vi.fn(), setScene: vi.fn() }));
  expect(within(screen.getByTestId("scene-camp")).getByRole("button", { name: "Poner este fondo" })).toBeTruthy();
});

it("un fallo deja el saldo como estaba y lo dice", async () => {
  const buy = vi.fn().mockResolvedValue({ ok: false, code: "UNAVAILABLE" });
  render(view({ balance: 120 }, { claim: vi.fn(), buy, setScene: vi.fn() }));
  await act(async () => fireEvent.click(within(screen.getByTestId("scene-creek")).getByRole("button", { name: /Comprar/ })));
  expect(screen.getByRole("status").textContent).toContain("Vuelve a intentarlo");
  expect(screen.getByTestId("acorn-balance").textContent).toContain("120");
});
