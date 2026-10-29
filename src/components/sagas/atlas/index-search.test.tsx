// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../messages/es.json";
import type { IndexAtlasSaga } from "@/lib/sagas/index-atlas/model";
import { IndexSearch } from "./index-search";

afterEach(cleanup);

const saga = (id: string, name: string, children: IndexAtlasSaga["children"] = []): IndexAtlasSaga => ({
  id, name, href: `/saga/${id}`, coverUrl: null, accent: "terracota", zone: "por-descubrir", comarca: "libros",
  titleCount: 3, typeBreakdown: { book: 3, movie: 0, series: 0 }, creator: null, routeCount: 0, ownedCount: 0,
  isFollowed: false, progress: null, children,
});
const SAGAS = [
  saga("mundo", "Mundodisco", [{ id: "guardia", name: "La Guardia", href: "/saga/guardia", accent: "beige", titleCount: 8 }]),
  saga("dune", "Dune"),
];

function show(query: string) {
  const props = { sagas: SAGAS, query, onQuery: vi.fn(), onPick: vi.fn() };
  render(<NextIntlClientProvider locale="es" messages={messages}><IndexSearch {...props} /></NextIntlClientProvider>);
  return props;
}

describe("IndexSearch", () => {
  it("lista la subsaga que coincide con su universo", () => {
    show("guard");
    const option = screen.getByRole("option", { name: /La Guardia/ });
    expect(option.textContent).toContain("en Mundodisco");
  });
  it("flecha abajo y Enter eligen la coincidencia", () => {
    const { onPick } = show("d");
    const input = screen.getByRole("combobox");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    // «d»: Mundodisco, La Guardia (hija) y Dune, en orden de lista; la segunda es la subsaga.
    expect(onPick).toHaveBeenCalledWith({ sagaId: "mundo", childId: "guardia" });
  });
  it("sin coincidencias avisa y no elige nada", () => {
    const { onPick } = show("zzz");
    expect(screen.getByRole("status").textContent).toBe("Ninguna saga coincide");
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" });
    expect(onPick).not.toHaveBeenCalled();
  });
  it("Escape vacía el texto", () => {
    const { onQuery } = show("guard");
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Escape" });
    expect(onQuery).toHaveBeenCalledWith("");
  });
  it("ignora tildes y mayúsculas", () => {
    show("GUARDIA");
    expect(screen.getAllByRole("option")).toHaveLength(1);
  });
});
