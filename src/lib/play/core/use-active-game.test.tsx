// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetPlayStoresForTests } from "./store";
import { useActiveGame } from "./use-active-game";
import { started } from "@/lib/play/commander/test-fixtures";

function Probe({ identity }: { identity: string }) {
  const { game } = useActiveGame(identity);
  return <output>{game ? "partida" : "vacio"}</output>;
}

beforeEach(() => {
  __resetPlayStoresForTests();
  // React 19: act necesita el flag en el entorno de test
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(() => vi.unstubAllGlobals());

describe("useActiveGame", () => {
  it("arranca vacío y se re-renderiza cuando el store cambia", async () => {
    const host = document.createElement("div");
    const root = createRoot(host);
    await act(async () => root.render(<Probe identity="anon" />));
    expect(host.textContent).toBe("vacio");
    const { getPlayStore } = await import("./store");
    await act(async () => getPlayStore("anon").start(started(1000)));
    expect(host.textContent).toBe("partida");
    await act(async () => root.unmount());
  });
});
