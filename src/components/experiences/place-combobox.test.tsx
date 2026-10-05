// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "../../../messages/es.json";
import { PlaceCombobox } from "./place-combobox";

const items = [
  { token: "tok-prado", name: "Museo Nacional del Prado", layer: "poi", subtitle: "Madrid, España" },
  { token: "tok-lisboa", name: "Lisboa", layer: "city", subtitle: "Portugal" },
];
let form: HTMLFormElement;
function show(props: Partial<Parameters<typeof PlaceCombobox>[0]> = {}) {
  render(<NextIntlClientProvider locale="es" messages={messages}><form data-testid="f"><label htmlFor="p">Lugar</label><PlaceCombobox id="p" {...props}/></form></NextIntlClientProvider>);
  form = screen.getByTestId("f") as HTMLFormElement;
}
const fields = () => Object.fromEntries(new FormData(form).entries());
async function type(value: string) {
  fireEvent.focus(screen.getByRole("combobox", { name: "Lugar" }));
  fireEvent.change(screen.getByRole("combobox", { name: "Lugar" }), { target: { value } });
  await act(async () => { await vi.advanceTimersByTimeAsync(300); });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ items }))));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("PlaceCombobox", () => {
  it("submits free text when nothing is chosen", async () => {
    show();
    await type("Casa de mis padres");
    expect(fields()).toEqual({ placeLabel: "Casa de mis padres" });
  });
  it("does not search below three characters", async () => {
    show();
    await type("ca");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("searches after the debounce and shows attribution", async () => {
    show();
    await type("prado");
    expect(fetch).toHaveBeenCalledWith("/api/places/search?q=prado", expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(screen.getByRole("option", { name: /Museo Nacional del Prado/ })).toBeTruthy();
    expect(screen.getByText("© OpenStreetMap")).toBeTruthy();
  });
  it("chooses with the keyboard and submits the token with the official name", async () => {
    show();
    await type("prado");
    const input = screen.getByRole("combobox", { name: "Lugar" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input.getAttribute("aria-activedescendant")).toBeTruthy();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(fields()).toEqual({ placeLabel: "Museo Nacional del Prado", placeToken: "tok-prado" });
    expect(screen.getByRole("button", { name: "Quitar Museo Nacional del Prado" })).toBeTruthy();
  });
  it("moves focus to the remove button after choosing with Enter", async () => {
    show();
    await type("prado");
    const input = screen.getByRole("combobox", { name: "Lugar" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Quitar Museo Nacional del Prado" }));
  });
  it("names the chip as the place and ties it to the field id", async () => {
    show({ defaultLabel: "Lisboa", linked: true });
    const group = screen.getByRole("group", { name: "Lugar: Lisboa" });
    expect(group.id).toBe("p");
  });
  it("ArrowDown reopens a closed list that still has items", async () => {
    show();
    await type("prado");
    const input = screen.getByRole("combobox", { name: "Lugar" });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(screen.getByRole("listbox")).toBeTruthy();
  });
  it("Escape closes the list and keeps the typed text", async () => {
    show();
    await type("prado");
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Lugar" }), { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(fields()).toEqual({ placeLabel: "prado" });
  });
  it("starts linked as a chip that keeps the place, and ✕ returns to empty text", async () => {
    show({ defaultLabel: "Lisboa", linked: true });
    expect(fields()).toEqual({ placeLabel: "Lisboa", keepPlace: "true" });
    fireEvent.click(screen.getByRole("button", { name: "Quitar Lisboa" }));
    expect(fields()).toEqual({ placeLabel: "" });
    expect(document.activeElement).toBe(screen.getByRole("combobox", { name: "Lugar" }));
  });
  it("hides suggestions silently when the search fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
    show();
    await type("prado");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("does not open the list when the field was left before the debounce elapsed", async () => {
    show();
    const input = screen.getByRole("combobox", { name: "Lugar" });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "prado" } });
    fireEvent.blur(input);
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    expect(screen.queryByRole("listbox")).toBeNull();
  });
  it("drops stale suggestions when the text falls below three characters", async () => {
    show();
    await type("prado");
    expect(screen.getByRole("listbox")).toBeTruthy();
    fireEvent.change(screen.getByRole("combobox", { name: "Lugar" }), { target: { value: "pr" } });
    expect(screen.queryByRole("listbox")).toBeNull();
    fireEvent.change(screen.getByRole("combobox", { name: "Lugar" }), { target: { value: "pra" } });
    expect(screen.queryByRole("listbox")).toBeNull();
  });
  it("stays a chip when linked even without a label", async () => {
    show({ linked: true });
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(fields()).toEqual({ placeLabel: "", keepPlace: "true" });
  });
});
