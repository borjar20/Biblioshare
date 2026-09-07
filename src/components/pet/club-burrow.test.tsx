// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, expect, it } from "vitest";
import messages from "../../../messages/es.json";
import { Burrow } from "./burrow";
import type { BurrowNeighbor } from "@/lib/pet/burrow";

afterEach(cleanup);
const pet: BurrowNeighbor = { userId: "ana", username: "ana", displayName: "Ana", avatarUrl: null,
  name: "Nuez", petClass: "wizard", stage: "acorn", level: 1 };
function show(own: BurrowNeighbor | null, neighbors: BurrowNeighbor[] = [], total = neighbors.length) {
  return render(<NextIntlClientProvider locale="es" messages={messages}>
    <Burrow own={own} neighbors={neighbors} total={total} club={{ name: "Lectores", ownOwner: own }} />
  </NextIntlClientProvider>);
}
it("el club se puede explorar antes de eclosionar y distingue vacío de propia sin vecinas", () => {
  const view = show(null);
  expect(screen.getByRole("heading", { name: "Madriguera · Lectores" })).toBeTruthy();
  expect(screen.getByText("Todavía no hay mascotas visibles en esta madriguera")).toBeTruthy();
  expect(screen.getByRole("link", { name: "Mi mascota" }).getAttribute("href")).toBe("/mascota");
  view.unmount();
  show(pet);
  expect(screen.queryByText("Todavía no hay mascotas visibles en esta madriguera")).toBeNull();
  fireEvent.click(within(screen.getByRole("list")).getByRole("button"));
  expect(screen.getByRole("link", { name: /@ana/ }).getAttribute("href")).toBe("/u/ana");
});
it("expande sesenta vecinas sin contar la propia y contrae con el mismo control", () => {
  const neighbors = Array.from({ length: 60 }, (_, i) => ({ ...pet, userId: `u${i}`, username: `u${i}` }));
  show(pet, neighbors, 65);
  const list = screen.getByRole("list");
  expect(within(list).getAllByRole("button")).toHaveLength(12);
  const toggle = screen.getByRole("button", { name: "Mostrar más" });
  toggle.focus();
  fireEvent.click(toggle);
  expect(within(list).getAllByRole("button")).toHaveLength(61);
  expect(screen.getByText("Mostrando 60 de 65 mascotas visibles del club, sin contar la tuya")).toBeTruthy();
  const collapse = screen.getByRole("button", { name: "Mostrar menos" });
  expect(collapse).toBe(document.activeElement);
  expect(collapse.getAttribute("aria-expanded")).toBe("true");
  fireEvent.click(collapse);
  expect(within(list).getAllByRole("button")).toHaveLength(12);
  expect(within(list).getAllByRole("button")[0].getAttribute("aria-label")).toContain("tu mascota");
});
