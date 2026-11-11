// src/components/detail/pass-actions-provider.test.tsx
// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { Component, useLayoutEffect, type ReactNode } from "react";
import { redirect } from "next/navigation";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MediaStatus } from "@/lib/library/types";

const h = vi.hoisted(() => ({
  updateStatus: vi.fn(), add: vi.fn(), rate: vi.fn(), push: vi.fn(), refresh: vi.fn(),
}));
vi.mock("@/lib/library/manage-actions", () => ({ updateStatus: h.updateStatus }));
vi.mock("@/lib/library/add-existing-item", () => ({ addExistingItemToLibrary: h.add }));
vi.mock("@/lib/passes/actions", () => ({ ratePass: h.rate }));
// Se conservan el `redirect` y el `unstable_rethrow` reales: el test de la
// sesión caducada necesita un error de redirect que Next reconozca de verdad.
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ push: h.push, replace: vi.fn(), refresh: h.refresh }),
  usePathname: () => "/libro/b1",
}));
vi.mock("./close-pass-sheet", () => ({
  ClosePassSheet: ({ passId, status }: { passId: string; status: string }) => <div data-testid="close-sheet">{passId}:{status}</div>,
}));
vi.mock("./new-pass-sheet", () => ({ NewPassSheet: () => <div data-testid="new-pass-sheet" /> }));
vi.mock("./resume-pass-sheet", () => ({ ResumePassSheet: () => <div data-testid="resume-sheet" /> }));

import { ItemStatusProvider, useItemStatus } from "./item-status-context";
import { PassActionsProvider, usePassActions } from "./pass-actions-provider";

let api: ReturnType<typeof usePassActions>;
function Probe() {
  const value = usePassActions();
  // Se publica en un efecto y no en el cuerpo: react-hooks prohíbe reasignar
  // una variable de fuera durante el render. act() vacía los efectos, así que
  // `api` siempre es el del último pintado cuando el test lo lee.
  useLayoutEffect(() => {
    api = value;
  });
  const { status } = useItemStatus();
  return <output data-testid="status">{status ?? "none"}</output>;
}
function mount(over: Partial<Parameters<typeof PassActionsProvider>[0]> = {}, status: MediaStatus | null = null) {
  return render(
    <ItemStatusProvider initialStatus={status}>
      <PassActionsProvider itemType="book" itemId="b1" isLoggedIn activePassId={null} activePassOpen={false}
        sessionHref={null} droppedAtLabel="" initialClosingPassId={null} {...over}>
        <Probe />
      </PassActionsProvider>
    </ItemStatusProvider>,
  );
}
const done = (over = {}) => ({ kind: "done", passId: "p1", closed: false, created: true, ...over });
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

beforeEach(() => { Object.values(h).forEach((f) => f.mockReset()); h.add.mockResolvedValue(undefined); h.updateStatus.mockResolvedValue(done()); });
afterEach(cleanup);

describe("addWith", () => {
  it("«quiero»: añade como pendiente, optimista, sin cambiar de estado después", async () => {
    mount();
    act(() => api.addWith("want"));
    expect(screen.getByTestId("status").textContent).toBe("planned");
    await flush();
    expect(h.add).toHaveBeenCalledWith("book", "b1");
    expect(h.updateStatus).not.toHaveBeenCalled();
  });
  it("«lo estoy leyendo»: añade y pasa a en curso", async () => {
    mount();
    act(() => api.addWith("started"));
    expect(screen.getByTestId("status").textContent).toBe("in_progress");
    await flush();
    expect(h.updateStatus).toHaveBeenCalledWith("book", "b1", "in_progress");
  });
  it("«ya lo leí»: termina y abre la hoja de cierre", async () => {
    h.updateStatus.mockResolvedValue(done({ closed: true }));
    mount();
    act(() => api.addWith("done"));
    await flush();
    expect(screen.getByTestId("close-sheet").textContent).toBe("p1:completed");
  });
  it.each(["done", "started"] as const)(
    "si falla el segundo paso de «%s», queda pendiente y avisa con un aviso neutro",
    async (intent) => {
      h.updateStatus.mockRejectedValue(new Error("x"));
      mount();
      act(() => api.addWith(intent));
      await flush();
      expect(screen.getByTestId("status").textContent).toBe("planned");
      expect(api.error).toBe("addedButPending");
    },
  );
  it("si falla el añadir, vuelve a no estar en la biblioteca", async () => {
    h.add.mockRejectedValue(new Error("x"));
    mount();
    act(() => api.addWith("want"));
    await flush();
    expect(screen.getByTestId("status").textContent).toBe("none");
    expect(api.error).toBe("actionError");
  });
  it("sin sesión no escribe: va a login", () => {
    mount({ isLoggedIn: false });
    act(() => api.addWith("want"));
    expect(h.add).not.toHaveBeenCalled();
    expect(h.push).toHaveBeenCalledWith(expect.stringContaining("/login"));
  });
  it("ignora un segundo toque mientras guarda", async () => {
    mount();
    act(() => { api.addWith("want"); api.addWith("want"); });
    await flush();
    expect(h.add).toHaveBeenCalledTimes(1);
  });
});

describe("changeStatus", () => {
  it("terminar abre la hoja de cierre con ese estado", async () => {
    h.updateStatus.mockResolvedValue(done({ closed: true }));
    mount({}, "in_progress");
    act(() => api.changeStatus("dropped"));
    await flush();
    expect(screen.getByTestId("close-sheet").textContent).toBe("p1:dropped");
  });
  it("askResume revierte el estado y abre la pregunta", async () => {
    h.updateStatus.mockResolvedValue({ kind: "askResume" });
    mount({}, "dropped");
    act(() => api.changeStatus("in_progress"));
    await flush();
    expect(screen.getByTestId("status").textContent).toBe("dropped");
    expect(screen.getByTestId("resume-sheet")).toBeTruthy();
  });
  it("no abre el cierre si llega closed sin passId", async () => {
    h.updateStatus.mockResolvedValue(done({ closed: true, passId: "" }));
    mount({}, "in_progress");
    act(() => api.changeStatus("completed"));
    await flush();
    expect(screen.queryByTestId("close-sheet")).toBeNull();
  });
  it("si falla, revierte y avisa", async () => {
    h.updateStatus.mockRejectedValue(new Error("x"));
    mount({}, "in_progress");
    act(() => api.changeStatus("completed"));
    await flush();
    expect(screen.getByTestId("status").textContent).toBe("in_progress");
    expect(api.error).toBe("actionError");
  });
});

describe("runPrimary", () => {
  it("libro pendiente: pasa a en curso y abre la sesión del pase", async () => {
    mount({}, "planned");
    act(() => api.runPrimary());
    await flush();
    expect(h.updateStatus).toHaveBeenCalledWith("book", "b1", "in_progress");
    expect(h.push).toHaveBeenCalledWith("/sesion/p1");
    // Un refresh en vuelo convierte el push en replace (session-origin.tsx):
    // la ficha se perdería del historial.
    expect(h.refresh).not.toHaveBeenCalled();
  });
  it("libro pendiente sin passId de vuelta: refresca y no navega", async () => {
    h.updateStatus.mockResolvedValue(done({ passId: "" }));
    mount({}, "planned");
    act(() => api.runPrimary());
    await flush();
    expect(h.push).not.toHaveBeenCalled();
    expect(h.refresh).toHaveBeenCalled();
  });
  it("libro en curso: va a la sesión sin escribir", () => {
    mount({ sessionHref: "/sesion/p9" }, "in_progress");
    act(() => api.runPrimary());
    expect(h.push).toHaveBeenCalledWith("/sesion/p9");
    expect(h.updateStatus).not.toHaveBeenCalled();
  });
  it("película pendiente: marca vista y abre el cierre", async () => {
    h.updateStatus.mockResolvedValue(done({ closed: true }));
    mount({ itemType: "movie" }, "planned");
    act(() => api.runPrimary());
    await flush();
    expect(h.updateStatus).toHaveBeenCalledWith("movie", "b1", "completed");
    expect(screen.getByTestId("close-sheet")).toBeTruthy();
  });
  it("película vista: otro visionado, ya cerrado, con su hoja", async () => {
    h.updateStatus.mockResolvedValue(done({ closed: true }));
    mount({ itemType: "movie" }, "completed");
    act(() => api.runPrimary());
    await flush();
    expect(h.updateStatus).toHaveBeenCalledWith("movie", "b1", "completed", "restart");
    expect(screen.getByTestId("close-sheet")).toBeTruthy();
  });
  it("libro terminado: nuevo pase en curso", async () => {
    mount({}, "completed");
    act(() => api.runPrimary());
    await flush();
    expect(h.updateStatus).toHaveBeenCalledWith("book", "b1", "in_progress", "restart");
  });
  it("abandonado: intenta retomar", async () => {
    h.updateStatus.mockResolvedValue({ kind: "askResume" });
    mount({}, "dropped");
    act(() => api.runPrimary());
    await flush();
    expect(screen.getByTestId("resume-sheet")).toBeTruthy();
  });
});

describe("newPass", () => {
  it("con el pase aún abierto, pregunta cómo cerrarlo", () => {
    mount({ activePassOpen: true }, "in_progress");
    act(() => api.newPass());
    expect(screen.getByTestId("new-pass-sheet")).toBeTruthy();
    expect(h.updateStatus).not.toHaveBeenCalled();
  });
});

describe("rate", () => {
  it("puntúa el pase activo", async () => {
    mount({ activePassId: "p1" }, "completed");
    let started: boolean | undefined;
    act(() => { started = api.rate(8); });
    await flush();
    expect(started).toBe(true);
    expect(h.rate).toHaveBeenCalledWith("p1", "book", "b1", 8);
  });
  it("sin pase activo no hace nada y devuelve false", () => {
    mount({}, null);
    let started: boolean | undefined;
    act(() => { started = api.rate(8); });
    expect(started).toBe(false);
    expect(h.rate).not.toHaveBeenCalled();
  });
  it("con otra escritura en vuelo, devuelve false sin escribir", async () => {
    const d = deferred<unknown>();
    h.updateStatus.mockReturnValue(d.promise);
    mount({ activePassId: "p1" }, "in_progress");
    act(() => api.changeStatus("completed"));
    let started: boolean | undefined;
    act(() => { started = api.rate(8); });
    expect(started).toBe(false);
    expect(h.rate).not.toHaveBeenCalled();
    await act(async () => { d.resolve(done()); await d.promise; });
    await flush();
  });
});

describe("?cerrar", () => {
  it("abre el cierre desde el primer pintado, y de nuevo si cambia", () => {
    const { rerender } = mount({ initialClosingPassId: "p7" }, "completed");
    expect(screen.getByTestId("close-sheet").textContent).toBe("p7:completed");
    rerender(
      <ItemStatusProvider initialStatus="completed">
        <PassActionsProvider itemType="book" itemId="b1" isLoggedIn activePassId="p8" activePassOpen={false}
          sessionHref={null} droppedAtLabel="" initialClosingPassId="p8"><Probe /></PassActionsProvider>
      </ItemStatusProvider>,
    );
    expect(screen.getByTestId("close-sheet").textContent).toBe("p8:completed");
  });
});

it("usePassActions fuera del proveedor lanza", () => {
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  expect(() => render(<Probe />)).toThrow();
  spy.mockRestore();
});

// Promesa que el test resuelve o rechaza a mano: deja ver el estado mientras la
// escritura sigue en vuelo.
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe("optimismo: el estado cambia antes de que responda el servidor", () => {
  it("changeStatus pinta el estado nuevo al instante y revierte si falla", async () => {
    const d = deferred<unknown>();
    h.updateStatus.mockReturnValue(d.promise);
    mount({}, "in_progress");
    act(() => api.changeStatus("completed"));
    expect(screen.getByTestId("status").textContent).toBe("completed");
    await act(async () => { d.reject(new Error("x")); await d.promise.catch(() => {}); });
    await flush();
    expect(screen.getByTestId("status").textContent).toBe("in_progress");
    expect(api.error).toBe("actionError");
  });
  it("película pendiente: «Marcar vista» pinta vista al instante y revierte si falla", async () => {
    const d = deferred<unknown>();
    h.updateStatus.mockReturnValue(d.promise);
    mount({ itemType: "movie" }, "planned");
    act(() => api.runPrimary());
    expect(screen.getByTestId("status").textContent).toBe("completed");
    await act(async () => { d.reject(new Error("x")); await d.promise.catch(() => {}); });
    await flush();
    expect(screen.getByTestId("status").textContent).toBe("planned");
  });
});

class Boundary extends Component<{ children: ReactNode }, { caught: unknown }> {
  state = { caught: null as unknown };
  static getDerivedStateFromError(caught: unknown) { return { caught }; }
  render() {
    return this.state.caught
      ? <div data-testid="caught">{String((this.state.caught as { digest?: string }).digest ?? "")}</div>
      : this.props.children;
  }
}

describe("sesión caducada", () => {
  it("el redirect a /login de la server action no se convierte en «actionError»", async () => {
    let redirectError: unknown;
    try { redirect("/login"); } catch (e) { redirectError = e; }
    h.updateStatus.mockRejectedValue(redirectError);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <Boundary>
        <ItemStatusProvider initialStatus="in_progress">
          <PassActionsProvider itemType="book" itemId="b1" isLoggedIn activePassId={null} activePassOpen={false}
            sessionHref={null} droppedAtLabel="" initialClosingPassId={null}><Probe /></PassActionsProvider>
        </ItemStatusProvider>
      </Boundary>,
    );
    act(() => api.changeStatus("completed"));
    await flush();
    await flush();
    spy.mockRestore();
    // Llega a Next (aquí, al boundary) tal cual, como un redirect.
    expect(screen.getByTestId("caught").textContent).toMatch(/^NEXT_REDIRECT/);
    expect(api.error).toBeNull();
  });
});

describe("sin sesión, ninguna escritura", () => {
  it("changeStatus va a login sin escribir ni cambiar el estado", () => {
    mount({ isLoggedIn: false }, "in_progress");
    act(() => api.changeStatus("completed"));
    expect(h.updateStatus).not.toHaveBeenCalled();
    expect(h.push).toHaveBeenCalledWith(expect.stringContaining("/login"));
    expect(screen.getByTestId("status").textContent).toBe("in_progress");
  });
  it("rate va a login sin escribir", () => {
    mount({ isLoggedIn: false, activePassId: "p1" }, "completed");
    let started: boolean | undefined;
    act(() => { started = api.rate(8); });
    expect(started).toBe(false);
    expect(h.rate).not.toHaveBeenCalled();
    expect(h.push).toHaveBeenCalledWith(expect.stringContaining("/login"));
  });
});
