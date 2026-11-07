// src/components/session/bookmark-field.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/es.json";
import { BookmarkField, bookmarkRange, pageFromFraction } from "./bookmark-field";
afterEach(cleanup);
const ui = (p: Parameters<typeof BookmarkField>[0]) => <NextIntlClientProvider locale="es" messages={messages}><BookmarkField {...p} /></NextIntlClientProvider>;

describe("bookmarkRange / pageFromFraction", () => {
  it("con total: de la página actual al total", () => {
    expect(bookmarkRange(180, 412)).toEqual({ min: 180, max: 412 });
    expect(bookmarkRange(null, 300)).toEqual({ min: 0, max: 300 });
  });
  it("sin total: max(actual + 100, actual × 1,5)", () => {
    expect(bookmarkRange(100, null)).toEqual({ min: 100, max: 200 });
    expect(bookmarkRange(400, null)).toEqual({ min: 400, max: 600 });
  });
  it("fracción a página, acotada", () => {
    expect(pageFromFraction(0, 180, 412)).toBe(180);
    expect(pageFromFraction(1, 180, 412)).toBe(412);
    expect(pageFromFraction(0.5, 180, 412)).toBe(296);
    expect(pageFromFraction(-1, 180, 412)).toBe(180);
    expect(pageFromFraction(2, 180, 412)).toBe(412);
  });
});

describe("BookmarkField", () => {
  it("es un slider accesible con valores y texto", () => {
    render(ui({ fromPage: 180, value: 214, total: 412, onChange: () => {} }));
    const s = screen.getByRole("slider", { name: messages.ritual.bookmark.label });
    expect(s.getAttribute("aria-valuemin")).toBe("180");
    expect(s.getAttribute("aria-valuemax")).toBe("412");
    expect(s.getAttribute("aria-valuenow")).toBe("214");
    expect(s.getAttribute("aria-valuetext")).toBe("página 214, 34 hoy");
  });
  it("teclado: flechas ±1, AvPág/RePág ±10, Inicio/Fin, acotado", () => {
    const onChange = vi.fn();
    render(ui({ fromPage: 180, value: 200, total: 412, onChange }));
    const s = screen.getByRole("slider");
    fireEvent.keyDown(s, { key: "ArrowRight" }); expect(onChange).toHaveBeenLastCalledWith(201);
    fireEvent.keyDown(s, { key: "ArrowLeft" }); expect(onChange).toHaveBeenLastCalledWith(199);
    fireEvent.keyDown(s, { key: "PageUp" }); expect(onChange).toHaveBeenLastCalledWith(210);
    fireEvent.keyDown(s, { key: "PageDown" }); expect(onChange).toHaveBeenLastCalledWith(190);
    fireEvent.keyDown(s, { key: "Home" }); expect(onChange).toHaveBeenLastCalledWith(180);
    fireEvent.keyDown(s, { key: "End" }); expect(onChange).toHaveBeenLastCalledWith(412);
  });
  it("sin valor parte de la página actual", () => {
    render(ui({ fromPage: 180, value: null, total: 412, onChange: () => {} }));
    expect(screen.getByRole("slider").getAttribute("aria-valuenow")).toBe("180");
  });
});
