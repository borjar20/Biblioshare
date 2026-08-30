// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetPlayStoresForTests } from "./store";
import { useActiveGame } from "./use-active-game";
import { started } from "@/lib/play/mtg/test-fixtures";

function Probe({ identity }: { identity: string }) {
  const { game } = useActiveGame(identity);
  return <output>{game ? "partida" : "vacio"}</output>;
}

beforeEach(async () => {
  // __resetPlayStoresForTests() es async (#931): espera a que la cola de
  // escrituras de cada store drene antes de destruirlo y limpiar el Map. Sin
  // el await, el Map seguía teniendo los stores del test anterior en el
  // primer getPlayStore() de este test — se reutilizaba su partida en vez de
  // arrancar en vacío.
  await __resetPlayStoresForTests();
  // jsdom conserva un único localStorage real para todo el fichero: sin este
  // clear, la partida persistida por un test "gotea" al siguiente al releerse
  // desde disco en el primer getPlayStore() de esa identidad.
  localStorage.clear();
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

  it("al cambiar de identidad refleja el store de la nueva identidad, sin mezclar partidas ni destruir la anterior", async () => {
    const host = document.createElement("div");
    const root = createRoot(host);
    const { getPlayStore } = await import("./store");

    await act(async () => root.render(<Probe identity="anon" />));
    await act(async () => getPlayStore("anon").start(started(1000)));
    expect(host.textContent).toBe("partida");

    // Misma instancia del componente, identidad distinta: debe leer el store
    // de "otro-uid" (sin partida), no seguir sirviendo el de "anon".
    await act(async () => root.render(<Probe identity="otro-uid" />));
    expect(host.textContent).toBe("vacio");

    // Volver a "anon" muestra su partida de nuevo: el cambio de identidad no
    // destruyó el store anterior, solo dejó de suscribirse a él.
    await act(async () => root.render(<Probe identity="anon" />));
    expect(host.textContent).toBe("partida");

    await act(async () => root.unmount());
  });
});
