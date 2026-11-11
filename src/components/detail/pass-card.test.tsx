// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useLayoutEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/es.json";
import type { MediaStatus } from "@/lib/library/types";
import { ItemStatusProvider, useItemStatus } from "./item-status-context";
import { PassCard, type PassCardProps } from "./pass-card";

// El proveedor real (escrituras, hojas, navegación) tiene sus propios tests;
// aquí solo importa qué ofrece la tarjeta y a qué método llama.
const actions = vi.hoisted(() => ({
  isPending: false,
  error: null as null | "actionError" | "addedButPending",
  addWith: vi.fn(),
  changeStatus: vi.fn(),
  runPrimary: vi.fn(),
  newPass: vi.fn(),
  rate: vi.fn(),
}));
vi.mock("./pass-actions-provider", () => ({ usePassActions: () => actions }));

beforeEach(() => {
  actions.isPending = false;
  actions.error = null;
  for (const fn of [actions.addWith, actions.changeStatus, actions.runPrimary, actions.newPass, actions.rate]) {
    fn.mockReset();
  }
  actions.rate.mockReturnValue(true);
});
afterEach(cleanup);

const base: PassCardProps = { itemType: "book", progress: null, rating: null };

// Publica isSaving como lo hace SeriesFollowCard (otra isla de la ficha).
function SavingSwitch() {
  const { setSaving } = useItemStatus();
  return <span data-testid="saving-switch" onClick={() => setSaving(true)} />;
}

function renderCard(props: Partial<PassCardProps>, status: MediaStatus | null) {
  return render(
    <NextIntlClientProvider locale="es" messages={messages}>
      <ItemStatusProvider initialStatus={status}>
        <PassCard {...base} {...props} />
      </ItemStatusProvider>
    </NextIntlClientProvider>,
  );
}

describe("PassCard", () => {
  it("sin pase: tres intenciones en libro, la primera como principal", () => {
    renderCard({ itemType: "book" }, null);
    const buttons = screen.getAllByRole("button").map((b) => b.textContent);
    expect(buttons).toEqual(["Quiero leerlo", "Lo estoy leyendo", "Ya lo leí"]);
    expect(screen.queryByText("Seguir")).toBeNull();
  });

  it("sin pase: dos intenciones en película", () => {
    renderCard({ itemType: "movie" }, null);
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["Quiero verla", "Ya la vi"]);
  });

  it("una intención llama a addWith", () => {
    renderCard({ itemType: "book" }, null);
    fireEvent.click(screen.getByRole("button", { name: "Ya lo leí" }));
    expect(actions.addWith).toHaveBeenCalledWith("done");
  });

  it("con pase: el estado se cambia en la tarjeta", () => {
    renderCard({ itemType: "book" }, "in_progress");
    const group = screen.getByRole("group", { name: "Tu estado" });
    fireEvent.click(within(group).getByRole("button", { name: /Leído/ }));
    expect(actions.changeStatus).toHaveBeenCalledWith("completed");
  });

  it.each([
    ["book", "planned", "Empezar a leer"],
    ["book", "in_progress", "Registrar sesión"],
    ["series", "in_progress", "Marcar episodio"],
    ["movie", "planned", "Marcar vista"],
    ["movie", "completed", "Registrar otro visionado"],
    ["book", "dropped", "Retomar"],
  ] as const)("%s %s: botón «%s»", (itemType, status, label) => {
    renderCard({ itemType }, status);
    fireEvent.click(screen.getByRole("button", { name: label }));
    expect(actions.runPrimary).toHaveBeenCalledTimes(1);
  });

  it("la nota se pone en la tarjeta", () => {
    renderCard({ itemType: "book", rating: null }, "completed");
    fireEvent.click(screen.getByRole("button", { name: "8/10" }));
    expect(actions.rate).toHaveBeenCalledWith(8);
  });

  it("la nota optimista solo se pinta si arrancó la escritura", () => {
    actions.rate.mockReturnValue(false);
    renderCard({ itemType: "book", rating: 4 }, "completed");
    fireEvent.click(screen.getByRole("button", { name: "8/10" }));
    expect(actions.rate).toHaveBeenCalledWith(8);
    expect(screen.getByTestId("pass-card-rating").getAttribute("data-value")).toBe("4");
  });

  it("la nota optimista se pinta al arrancar la escritura", () => {
    renderCard({ itemType: "book", rating: 4 }, "completed");
    fireEvent.click(screen.getByRole("button", { name: "8/10" }));
    expect(screen.getByTestId("pass-card-rating").getAttribute("data-value")).toBe("8");
  });

  it("tras elegir una intención, el foco pasa al botón principal cuando deja de guardar", () => {
    // Como el proveedor real: estado optimista y escritura en vuelo.
    function Harness() {
      const { setStatus, setSaving } = useItemStatus();
      useLayoutEffect(() => {
        actions.addWith.mockImplementation(() => {
          setStatus("planned");
          setSaving(true);
        });
      });
      return (
        <>
          <span data-testid="finish" onClick={() => setSaving(false)} />
          <PassCard {...base} />
        </>
      );
    }
    render(
      <NextIntlClientProvider locale="es" messages={messages}>
        <ItemStatusProvider initialStatus={null}>
          <Harness />
        </ItemStatusProvider>
      </NextIntlClientProvider>,
    );
    const intent = screen.getByRole("button", { name: "Quiero leerlo" });
    intent.focus();
    act(() => { fireEvent.click(intent); });
    // Mientras guarda el principal está deshabilitado: el foco aún no puede ir.
    const primary = screen.getByRole("button", { name: "Empezar a leer" });
    expect(document.activeElement).not.toBe(primary);
    // fireEvent sobre un span no mueve el foco (no es enfocable).
    fireEvent.click(screen.getByTestId("finish"));
    expect(document.activeElement).toBe(primary);
  });

  it("sin intención elegida en la tarjeta, un cambio de estado no mueve el foco", () => {
    function Harness() {
      const { setStatus } = useItemStatus();
      return (
        <>
          <button type="button" data-testid="outside" onClick={() => setStatus("planned")} />
          <PassCard {...base} />
        </>
      );
    }
    render(
      <NextIntlClientProvider locale="es" messages={messages}>
        <ItemStatusProvider initialStatus={null}>
          <Harness />
        </ItemStatusProvider>
      </NextIntlClientProvider>,
    );
    act(() => { fireEvent.click(screen.getByTestId("outside")); });
    expect(document.activeElement).not.toBe(screen.getByRole("button", { name: "Empezar a leer" }));
  });

  it("la nota optimista se resincroniza con la prop", () => {
    const view = renderCard({ itemType: "book", rating: 4 }, "completed");
    fireEvent.click(screen.getByRole("button", { name: "8/10" }));
    expect(screen.getByTestId("pass-card-rating").getAttribute("data-value")).toBe("8");
    // El servidor devuelve otra nota (p. ej. la escritura falló): manda la prop.
    view.rerender(
      <NextIntlClientProvider locale="es" messages={messages}>
        <ItemStatusProvider initialStatus="completed">
          <PassCard {...base} rating={6} />
        </ItemStatusProvider>
      </NextIntlClientProvider>,
    );
    expect(screen.getByTestId("pass-card-rating").getAttribute("data-value")).toBe("6");
  });

  it("si la nota no se guarda, vuelve a la de antes", () => {
    const view = renderCard({ itemType: "book", rating: 4 }, "completed");
    fireEvent.click(screen.getByRole("button", { name: "8/10" }));
    actions.error = "actionError";
    view.rerender(
      <NextIntlClientProvider locale="es" messages={messages}>
        <ItemStatusProvider initialStatus="completed">
          <PassCard {...base} rating={4} />
        </ItemStatusProvider>
      </NextIntlClientProvider>,
    );
    expect(screen.getByTestId("pass-card-rating").getAttribute("data-value")).toBe("4");
  });

  it("pendiente: sin nota", () => {
    renderCard({ itemType: "book" }, "planned");
    expect(screen.queryByRole("button", { name: "8/10" })).toBeNull();
  });

  it("mientras guarda, todo deshabilitado y aria-busy", () => {
    actions.isPending = true;
    renderCard({ itemType: "book" }, "in_progress");
    screen.getAllByRole("button").forEach((b) => expect(b).toHaveProperty("disabled", true));
    expect(screen.getByTestId("status-badge").getAttribute("aria-busy")).toBe("true");
  });

  // SeriesFollowCard escribe en su propia transición y solo publica
  // setSaving(true): sin esto la tarjeta lanzaría una segunda escritura a la vez.
  it("mientras otra isla guarda (isSaving), los controles se deshabilitan", () => {
    render(
      <NextIntlClientProvider locale="es" messages={messages}>
        <ItemStatusProvider initialStatus="in_progress">
          <SavingSwitch />
          <PassCard {...base} />
        </ItemStatusProvider>
      </NextIntlClientProvider>,
    );
    fireEvent.click(screen.getByTestId("saving-switch"));
    const group = screen.getByRole("group", { name: "Tu estado" });
    within(group).getAllByRole("button").forEach((b) => expect(b).toHaveProperty("disabled", true));
    expect(screen.getByRole("button", { name: "Registrar sesión" })).toHaveProperty("disabled", true);
    fireEvent.click(within(group).getByRole("button", { name: /Leído/ }));
    expect(actions.changeStatus).not.toHaveBeenCalled();
  });

  it("sin pase, isSaving también deshabilita las intenciones", () => {
    render(
      <NextIntlClientProvider locale="es" messages={messages}>
        <ItemStatusProvider initialStatus={null}>
          <SavingSwitch />
          <PassCard {...base} />
        </ItemStatusProvider>
      </NextIntlClientProvider>,
    );
    fireEvent.click(screen.getByTestId("saving-switch"));
    expect(screen.getByRole("button", { name: "Quiero leerlo" })).toHaveProperty("disabled", true);
  });

  it("serie al día: marca «Al día» junto al progreso, sin tocar las pastillas", () => {
    renderCard(
      { itemType: "series", upToDate: true, progress: { percent: 100, left: "10 / 10 vistos", right: "100%" } },
      "in_progress",
    );
    expect(screen.getByText("Al día")).not.toBeNull();
    const group = screen.getByRole("group", { name: "Tu estado" });
    expect(within(group).getByRole("button", { name: /Viendo/ }).getAttribute("aria-pressed")).toBe("true");
  });

  it("serie no al día (o ya no en curso): sin marca", () => {
    renderCard({ itemType: "series", upToDate: false, progress: { percent: 50, left: "5 / 10 vistos", right: "50%" } }, "in_progress");
    expect(screen.queryByText("Al día")).toBeNull();
    cleanup();
    // El estado optimista manda: si se marca Vista, la marca no se queda colgada.
    renderCard({ itemType: "series", upToDate: true, progress: { percent: 100, left: "10 / 10 vistos", right: "100%" } }, "completed");
    expect(screen.queryByText("Al día")).toBeNull();
  });

  it("el botón principal tiene la misma forma con y sin pase", () => {
    renderCard({ itemType: "book" }, null);
    const intentClass = screen.getByRole("button", { name: "Quiero leerlo" }).className;
    cleanup();
    renderCard({ itemType: "book" }, "planned");
    const controlClass = screen.getByRole("button", { name: "Empezar a leer" }).className;
    const radius = (c: string) => c.split(/\s+/).filter((k) => k.startsWith("rounded"));
    expect(radius(intentClass)).toEqual(radius(controlClass));
  });

  it("muestra el error con role=alert", () => {
    actions.error = "actionError";
    renderCard({ itemType: "book" }, "in_progress");
    expect(screen.getByRole("alert").textContent).toContain("No se pudo guardar");
  });

  it("conserva la barra de progreso", () => {
    renderCard({ itemType: "book", progress: { percent: 41, left: "pág. 100 / 244", right: "41%" } }, "in_progress");
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("41");
  });
});
