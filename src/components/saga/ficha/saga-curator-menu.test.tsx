// @vitest-environment jsdom
import { Activity, type ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { SagaCuratorMenu } from "./saga-curator-menu";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
// El <Link> real necesita el router de la app; aquí basta un <a> que respete onClick.
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest} onClick={(e) => { (rest as { onClick?: (e: unknown) => void }).onClick?.(e); e.preventDefault(); }}>
      {children}
    </a>
  ),
}));

// jsdom no implementa el modal de <dialog>: se emula con el atributo `open`.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});

afterEach(cleanup);

function dialog() {
  return document.querySelector("dialog") as HTMLDialogElement;
}

describe("SagaCuratorMenu", () => {
  it("se abre con el «⋯»", () => {
    render(<SagaCuratorMenu sagaId="s1" hasParent={false} />);
    fireEvent.click(screen.getByRole("button", { name: "curatorMenu" }));
    expect(dialog().open).toBe(true);
  });

  it("se cierra al pulsar un enlace (navega fuera de la ficha)", () => {
    render(<SagaCuratorMenu sagaId="s1" hasParent={false} />);
    fireEvent.click(screen.getByRole("button", { name: "curatorMenu" }));
    fireEvent.click(screen.getByText(/editSheet/));
    expect(dialog().open).toBe(false);
  });

  // Regresión: con cacheComponents, Next no desmonta la ficha al navegar, la
  // oculta con <Activity>. Un <dialog> abierto con showModal() que se queda
  // oculto sigue en la top layer y deja inerte el resto del documento: en
  // /editar «Guardar cambios» no recibía el clic (TRAMPAS §26).
  it("se cierra cuando <Activity> oculta la ficha y sigue cerrado al volver", () => {
    const view = render(
      <Activity mode="visible">
        <SagaCuratorMenu sagaId="s1" hasParent={false} />
      </Activity>,
    );
    fireEvent.click(screen.getByRole("button", { name: "curatorMenu" }));
    expect(dialog().open).toBe(true);

    act(() => {
      view.rerender(
        <Activity mode="hidden">
          <SagaCuratorMenu sagaId="s1" hasParent={false} />
        </Activity>,
      );
    });
    expect(dialog().open).toBe(false);

    act(() => {
      view.rerender(
        <Activity mode="visible">
          <SagaCuratorMenu sagaId="s1" hasParent={false} />
        </Activity>,
      );
    });
    expect(dialog().open).toBe(false);
  });
});
