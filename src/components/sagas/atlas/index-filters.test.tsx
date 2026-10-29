// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../messages/es.json";
import { NO_FILTERS, type IndexFilters as Filters } from "@/lib/sagas/index-atlas/params";
import { IndexFilters } from "./index-filters";

afterEach(cleanup);

function show(filters: Filters, authenticated = true) {
  const onChange = vi.fn();
  render(<NextIntlClientProvider locale="es" messages={messages}><IndexFilters filters={filters} authenticated={authenticated} onChange={onChange} /></NextIntlClientProvider>);
  return onChange;
}

describe("IndexFilters", () => {
  it("pulsar «Películas» añade el tipo", () => {
    const onChange = show(NO_FILTERS);
    fireEvent.click(screen.getByRole("button", { name: "Películas" }));
    expect(onChange).toHaveBeenCalledWith({ ...NO_FILTERS, tipos: ["pelicula"] });
  });
  it("un filtro activo marca aria-pressed y se quita al pulsarlo", () => {
    const onChange = show({ ...NO_FILTERS, min5: true });
    const b = screen.getByRole("button", { name: "≥ 5 títulos" });
    expect(b.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(b);
    expect(onChange).toHaveBeenCalledWith(NO_FILTERS);
  });
  it("sin sesión no ofrece «En tu colección»", () => {
    show(NO_FILTERS, false);
    expect(screen.queryByRole("button", { name: "En tu colección" })).toBeNull();
    expect(screen.getByRole("button", { name: "Con itinerarios" })).toBeTruthy();
  });
  it("«Quitar filtros» solo aparece con filtros activos y los vacía", () => {
    show(NO_FILTERS);
    expect(screen.queryByRole("button", { name: "Quitar filtros" })).toBeNull();
    cleanup();
    const onChange = show({ ...NO_FILTERS, itinerarios: true });
    fireEvent.click(screen.getByRole("button", { name: "Quitar filtros" }));
    expect(onChange).toHaveBeenCalledWith(NO_FILTERS);
  });
});
