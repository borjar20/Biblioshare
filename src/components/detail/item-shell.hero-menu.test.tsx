// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/es.json";
import type { MediaStatus } from "@/lib/library/types";
import { ItemStatusProvider } from "./item-status-context";

// Quitar la obra de la biblioteca vive SOLO en el ⋯ desde que Mi registro
// perdió su enlace rojo. La barra del cartel que lo llevaba es `lg:hidden`, así
// que desde `lg` el mismo menú va junto a los chips de la cabecera.
const mutations = vi.hoisted(() => ({ removeFromLibrary: vi.fn(), updateStatus: vi.fn() }));
vi.mock("@/lib/library/manage-actions", () => mutations);
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/libro/b1",
}));
// next/font no corre fuera del compilador de Next.
vi.mock("./poster-font", () => ({ posterFont: { variable: "" } }));
import { ItemShell } from "./item-shell";
import { HeroMenu } from "./hero-menu";

beforeAll(() => {
  // jsdom no implementa <dialog>.showModal/close.
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
});
beforeEach(() => mutations.removeFromLibrary.mockReset());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderShell(status: MediaStatus | null, canEditCatalog = false) {
  return render(
    <NextIntlClientProvider locale="es" messages={messages}>
      <ItemStatusProvider initialStatus={status}>
        <ItemShell
          itemType="book" mediaLabel="Libro" title="El imperio final" byline={null}
          genres={["Fantasía"]} coverUrl={null} workHue={30} avgRating={null}
          ratingsLabel="" backLabel="Volver"
          menuSlot={<HeroMenu itemType="book" itemId="b1" canEditCatalog={canEditCatalog} />}
          passCard={null} tabs={null}
        />
      </ItemStatusProvider>
    </NextIntlClientProvider>,
  );
}

const desktop = () => screen.getByTestId("hero-menu-desktop");

describe("el ⋯ de la ficha en móvil y escritorio", () => {
  it("con la obra en la biblioteca hay un ⋯ por punto de corte", () => {
    renderShell("in_progress");
    const triggers = screen.getAllByRole("button", { name: "Más opciones" });
    expect(triggers).toHaveLength(2);
    // Escritorio: visible solo desde lg, en la fila de chips de la cabecera.
    expect(desktop().className).toContain("hidden");
    expect(desktop().className).toContain("lg:block");
    expect(within(desktop()).getByRole("button", { name: "Más opciones" })).toBeDefined();
    // Móvil: el otro vive en la barra del cartel, que desaparece desde lg.
    const mobile = triggers.find((b) => !desktop().contains(b))!;
    expect(mobile.closest(".lg\\:hidden")).not.toBeNull();
  });

  it("desde escritorio, «Quitar de mi biblioteca» confirma y llama a removeFromLibrary", () => {
    const confirm = vi.fn(() => true);
    vi.stubGlobal("confirm", confirm);
    renderShell("completed");
    fireEvent.click(within(desktop()).getByRole("button", { name: "Más opciones" }));
    const dialogs = document.querySelectorAll("dialog");
    // Dos instancias, pero solo se abre la que se ha pulsado.
    expect([...dialogs].filter((d) => d.open)).toHaveLength(1);
    const open = [...dialogs].find((d) => d.open)!;
    expect(desktop().contains(open)).toBe(true);
    fireEvent.click(within(open).getByRole("button", { name: "Quitar de mi biblioteca" }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(mutations.removeFromLibrary).toHaveBeenCalledWith("book", "b1");
  });

  it("si no se confirma, no se quita", () => {
    vi.stubGlobal("confirm", vi.fn(() => false));
    renderShell("completed");
    fireEvent.click(within(desktop()).getByRole("button", { name: "Más opciones" }));
    const open = [...document.querySelectorAll("dialog")].find((d) => d.open)!;
    fireEvent.click(within(open).getByRole("button", { name: "Quitar de mi biblioteca" }));
    expect(mutations.removeFromLibrary).not.toHaveBeenCalled();
  });

  it("sin la obra en la biblioteca ni rol, no hay nada que ofrecer", () => {
    renderShell(null);
    expect(screen.queryByRole("button", { name: "Más opciones" })).toBeNull();
  });
});
