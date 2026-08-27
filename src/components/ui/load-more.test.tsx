// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LoadMore } from "./load-more";

const push = vi.fn();
// Componente cliente: fuera del App Router `useRouter` no tiene contexto.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: (...args: unknown[]) => push(...args) }),
}));

afterEach(() => {
  cleanup();
  push.mockClear();
});

function renderLoadMore(preview?: React.ReactNode) {
  return render(
    <LoadMore
      href="/coleccion?tab=todo&n=48"
      label="Cargar más"
      showingLabel="24 de 138 obras"
      pendingPreview={preview}
    />,
  );
}

describe("LoadMore", () => {
  it("el botón es un enlace REAL con el href, no un botón con onClick", () => {
    renderLoadMore();
    const a = screen.getByText("Cargar más").closest("a");
    // Si fuera un <button>, el clic con Ctrl no podría abrir en pestaña nueva y
    // el rastreador de un lector de pantalla no vería un destino.
    expect(a).not.toBeNull();
    expect(a?.getAttribute("href")).toBe("/coleccion?tab=todo&n=48");
  });

  it("pinta el recuento junto al botón", () => {
    renderLoadMore();
    expect(screen.getByText("24 de 138 obras")).toBeTruthy();
  });

  it("el clic normal navega SIN scroll: la lista crece por abajo y no se pierde el sitio", () => {
    renderLoadMore();
    fireEvent.click(screen.getByText("Cargar más").closest("a")!, { button: 0 });
    expect(push).toHaveBeenCalledWith("/coleccion?tab=todo&n=48", { scroll: false });
  });

  it("el clic con modificador NO se intercepta: lo navega el navegador", () => {
    renderLoadMore();
    const a = screen.getByText("Cargar más").closest("a")!;
    for (const mod of ["metaKey", "ctrlKey", "shiftKey", "altKey"]) {
      fireEvent.click(a, { button: 0, [mod]: true });
    }
    // Y el clic de rueda (botón central), que también abre pestaña nueva.
    fireEvent.click(a, { button: 1 });
    expect(push).not.toHaveBeenCalled();
  });

  it("las filas fantasma no se pintan mientras no hay navegación en vuelo", () => {
    renderLoadMore(<div data-testid="fantasma" />);
    expect(screen.queryByTestId("fantasma")).toBeNull();
  });
});
