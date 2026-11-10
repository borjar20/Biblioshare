// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/es.json";
import type { MediaStatus } from "@/lib/library/types";
import { ItemStatusProvider } from "./item-status-context";
import { PassCard, type PassCardProps } from "./pass-card";

// El proveedor real (escrituras, hojas, navegación) tiene sus propios tests;
// aquí solo importa qué ofrece la tarjeta y a qué método llama.
const actions = vi.hoisted(() => ({
  isPending: false,
  error: null as null | "actionError" | "doneButPlanned",
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
});
afterEach(cleanup);

const base: PassCardProps = { itemType: "book", progress: null, rating: null };

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
