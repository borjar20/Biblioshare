// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClubSearch } from "./club-search";

const router = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

beforeEach(() => { vi.useFakeTimers(); router.replace.mockClear(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("la búsqueda de clubes conserva su sección", () => {
  it("busca dentro de Comunidad sin saltar al directorio antiguo", () => {
    render(<ClubSearch placeholder="Buscar clubes" initialQuery="" basePath="/comunidad"/>);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "  cine y libros  " } });
    act(() => { vi.advanceTimersByTime(300); });
    expect(router.replace).toHaveBeenCalledWith("/comunidad?q=cine%20y%20libros", { scroll: false });
  });

  it("borrar la búsqueda vuelve a Comunidad", () => {
    render(<ClubSearch placeholder="Buscar clubes" initialQuery="cine" basePath="/comunidad"/>);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "" } });
    act(() => { vi.advanceTimersByTime(300); });
    expect(router.replace).toHaveBeenCalledWith("/comunidad", { scroll: false });
  });

  it("los enlaces antiguos de Clubes siguen buscando en su ruta", () => {
    render(<ClubSearch placeholder="Buscar clubes" initialQuery=""/>);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "cine" } });
    act(() => { vi.advanceTimersByTime(300); });
    expect(router.replace).toHaveBeenCalledWith("/clubes?q=cine", { scroll: false });
  });

  it("limpia el filtro al volver a Clubes y cancela la búsqueda pendiente", () => {
    const view = render(<ClubSearch placeholder="Buscar clubes" initialQuery="cine" basePath="/comunidad"/>);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "cine clásico" } });
    view.rerender(<ClubSearch placeholder="Buscar clubes" initialQuery="" basePath="/comunidad"/>);
    expect(screen.getByRole<HTMLInputElement>("searchbox").value).toBe("");
    act(() => { vi.advanceTimersByTime(300); });
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("una respuesta anterior no interrumpe lo que se está escribiendo", () => {
    const view = render(<ClubSearch placeholder="Buscar clubes" initialQuery="" basePath="/comunidad"/>);
    const input = screen.getByRole<HTMLInputElement>("searchbox");
    input.focus();
    fireEvent.change(input, { target: { value: "cine" } });
    act(() => { vi.advanceTimersByTime(300); });
    fireEvent.change(input, { target: { value: "cine clásico" } });
    act(() => { vi.advanceTimersByTime(300); });
    view.rerender(<ClubSearch placeholder="Buscar clubes" initialQuery="cine" basePath="/comunidad"/>);
    expect(input.value).toBe("cine clásico");
    expect(document.activeElement).toBe(input);
    router.replace.mockClear();
    act(() => { vi.advanceTimersByTime(300); });
    expect(router.replace).not.toHaveBeenCalled();
    view.rerender(<ClubSearch placeholder="Buscar clubes" initialQuery="cine clásico" basePath="/comunidad"/>);
    expect(input.value).toBe("cine clásico");
    router.replace.mockClear();
    act(() => { vi.advanceTimersByTime(300); });
    expect(router.replace).not.toHaveBeenCalled();
    view.rerender(<ClubSearch placeholder="Buscar clubes" initialQuery="cine" basePath="/comunidad"/>);
    expect(input.value).toBe("cine");
  });
});
