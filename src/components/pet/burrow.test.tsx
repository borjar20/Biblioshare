// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it } from "vitest";
import messages from "../../../messages/es.json";
import type { BurrowNeighbor } from "@/lib/pet/burrow";
import { Burrow } from "./burrow";

afterEach(cleanup);
const own = { name: "Nuez", petClass: "wizard" as const, stage: "acorn" as const };
const neighbor: BurrowNeighbor = {
  userId: "ana-id", username: "ana", displayName: "Ana", avatarUrl: null,
  name: "Nube", petClass: "fighter", stage: "adult",
};
function show(ownPet = own as typeof own | null, neighbors = [neighbor], total = neighbors.length, followingCount = 1) {
  return render(<NextIntlClientProvider locale="es" messages={messages}>
    <Burrow own={ownPet} neighbors={neighbors} total={total} followingCount={followingCount} />
  </NextIntlClientProvider>);
}

describe("Madriguera", () => {
  it("expande hasta 60 vecinas y cuenta el límite sin incluir la propia", () => {
    const neighbors = Array.from({ length: 60 }, (_, i) => ({ ...neighbor, userId: `u${i}`, username: `ana${i}` }));
    show(own, neighbors, 85);
    expect(within(screen.getByRole("list")).getAllByRole("button")).toHaveLength(12);
    fireEvent.click(screen.getByRole("button", { name: "Mostrar más" }));
    const buttons = within(screen.getByRole("list")).getAllByRole("button");
    expect(buttons).toHaveLength(61);
    expect(buttons[0].getAttribute("aria-label")).toContain("Nuez");
    expect(screen.getByText("Mostrando 60 de 85 mascotas de tus seguidos")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Mostrar más" })).toBeNull();
  });

  it("permite explorar doce vecinas antes de tener mascota", () => {
    const neighbors = Array.from({ length: 13 }, (_, i) => ({ ...neighbor, userId: `u${i}` }));
    show(null, neighbors);
    expect(within(screen.getByRole("list")).getAllByRole("button")).toHaveLength(12);
    expect(screen.queryByText("La tuya")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Mostrar más" }));
    expect(within(screen.getByRole("list")).getAllByRole("button")).toHaveLength(13);
  });

  it.each([0, 2])("distingue el vacío con %i seguidos", (count) => {
    show(null, [], 0, count);
    expect(screen.queryByRole("list")).toBeNull();
    if (count === 0) {
      expect(screen.getByRole("link", { name: "Buscar personas" }).getAttribute("href")).toBe("/buscar?modo=personas");
    } else {
      expect(screen.getByText("Todavía no hay mascotas de tus seguidos que puedas ver aquí.")).toBeTruthy();
      expect(screen.queryByRole("link")).toBeNull();
    }
  });

  it("la bellota propia se puede seleccionar incluso sin vecinas", () => {
    show(own, [], 0, 0);
    fireEvent.click(screen.getByRole("button", { name: /Nuez.*Bellota.*tu mascota/ }));
    expect(screen.getByRole("region", { name: /detalle/i }).textContent).toContain("Bellota");
  });
  it("abre una tarjeta por vez y al tocar de nuevo la cierra", () => {
    show();
    const buttons = within(screen.getByRole("list")).getAllByRole("button");
    expect(buttons[0].getAttribute("aria-label")).toContain("Nuez");
    fireEvent.click(screen.getByRole("button", { name: /Nube.*Guerrera.*Adulta.*@ana/ }));
    expect(screen.getByRole("link", { name: /@ana/ }).getAttribute("href")).toBe("/u/ana");
    fireEvent.click(buttons[0]);
    expect(screen.queryByRole("link", { name: /@ana/ })).toBeNull();
    expect(screen.getByRole("region", { name: /detalle/i }).textContent).toContain("Nuez");
    fireEvent.click(buttons[0]);
    expect(screen.getByRole("region", { name: /detalle/i }).textContent).toBe("");
  });
});
