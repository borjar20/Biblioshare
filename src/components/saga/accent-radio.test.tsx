// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AccentRadio } from "./accent-radio";
import type { SagaAccentToken } from "@/lib/sagas/accents";

vi.mock("next-intl", () => ({ useTranslations: () => () => "Automático" }));
afterEach(cleanup);

const values: Array<SagaAccentToken | null | undefined> = [
  undefined, null, "terracota", "verde", "teal", "ambar", "purpura",
];

it.each(values)("envía el acento inicial %s con un único radio nativo seleccionado", (defaultValue) => {
  const { container } = render(<form><AccentRadio name="accent" defaultValue={defaultValue} /></form>);
  const radios = screen.getAllByRole<HTMLInputElement>("radio");
  expect(radios).toHaveLength(6);
  expect(radios.every(radio => radio.tagName === "INPUT" && radio.name === "accent")).toBe(true);
  expect(radios.filter(radio => radio.checked).map(radio => radio.value)).toEqual([defaultValue ?? ""]);
  expect(new FormData(container.querySelector("form")!).get("accent")).toBe(defaultValue ?? "");
});

it("conserva la selección exclusiva y el valor enviado al pasar de color a automático", () => {
  const { container } = render(<form><AccentRadio name="accent" defaultValue="verde" /></form>);
  const form = container.querySelector("form")!;
  fireEvent.click(screen.getByRole("radio", { name: "purpura" }));
  expect(new FormData(form).get("accent")).toBe("purpura");
  fireEvent.click(screen.getByRole("radio", { name: "Automático" }));
  expect(screen.getAllByRole<HTMLInputElement>("radio").filter(radio => radio.checked).map(radio => radio.value)).toEqual([""]);
  expect(new FormData(form).get("accent")).toBe("");
});
