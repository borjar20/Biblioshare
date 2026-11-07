// src/components/session/bookmark-field.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/es.json";
import { BookmarkField, bookmarkRange, pageFromFraction } from "./bookmark-field";
afterEach(cleanup);

// jsdom no trae PointerEvent: sin él, fireEvent.pointer* crea un Event sin
// clientX/clientY/pointerId.
if (typeof window.PointerEvent === "undefined") {
  class PointerEventPolyfill extends MouseEvent {
    pointerId: number;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
    }
  }
  (window as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent = PointerEventPolyfill;
}
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

// El canto mide 412 px desde x = 0: con total 412, x px = página x.
function slider() {
  const s = screen.getByRole("slider");
  s.getBoundingClientRect = () => ({ left: 0, top: 0, width: 412, height: 54, right: 412, bottom: 54, x: 0, y: 0, toJSON: () => ({}) });
  return s;
}

describe("BookmarkField · puntero", () => {
  it("bajar el dedo no escribe; un toque sin movimiento fija la página al levantarlo", () => {
    const onChange = vi.fn();
    render(ui({ fromPage: 180, value: 200, total: 412, onChange }));
    const s = slider();
    fireEvent.pointerDown(s, { pointerId: 1, clientX: 300, clientY: 20 });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.pointerUp(s, { pointerId: 1, clientX: 300, clientY: 20 });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(300);
  });

  it("arrastre horizontal: tras el umbral la cinta sigue al dedo, sin transición, y al soltar no repite", () => {
    const onChange = vi.fn();
    render(ui({ fromPage: 180, value: 200, total: 412, onChange }));
    const s = slider();
    fireEvent.pointerDown(s, { pointerId: 1, clientX: 250, clientY: 20 });
    fireEvent.pointerMove(s, { pointerId: 1, clientX: 254, clientY: 20 });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.pointerMove(s, { pointerId: 1, clientX: 270, clientY: 21 });
    expect(onChange).toHaveBeenLastCalledWith(270);
    expect(s.hasAttribute("data-dragging")).toBe(true);
    fireEvent.pointerMove(s, { pointerId: 1, clientX: 320, clientY: 22 });
    expect(onChange).toHaveBeenLastCalledWith(320);
    fireEvent.pointerUp(s, { pointerId: 1, clientX: 320, clientY: 22 });
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(s.hasAttribute("data-dragging")).toBe(false);
  });

  it("un gesto vertical (scroll de la hoja) no cambia la página", () => {
    const onChange = vi.fn();
    render(ui({ fromPage: 180, value: 200, total: 412, onChange }));
    const s = slider();
    fireEvent.pointerDown(s, { pointerId: 1, clientX: 300, clientY: 20 });
    fireEvent.pointerMove(s, { pointerId: 1, clientX: 302, clientY: 40 });
    fireEvent.pointerMove(s, { pointerId: 1, clientX: 330, clientY: 90 });
    fireEvent.pointerUp(s, { pointerId: 1, clientX: 330, clientY: 90 });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("tras un pointercancel no escribe nada", () => {
    const onChange = vi.fn();
    render(ui({ fromPage: 180, value: 200, total: 412, onChange }));
    const s = slider();
    fireEvent.pointerDown(s, { pointerId: 1, clientX: 300, clientY: 20 });
    fireEvent.pointerCancel(s, { pointerId: 1 });
    fireEvent.pointerUp(s, { pointerId: 1, clientX: 300, clientY: 20 });
    fireEvent.pointerMove(s, { pointerId: 1, clientX: 360, clientY: 20 });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("el toque se acota al tramo [actual, total]", () => {
    const onChange = vi.fn();
    render(ui({ fromPage: 180, value: 200, total: 412, onChange }));
    const s = slider();
    fireEvent.pointerDown(s, { pointerId: 1, clientX: 40, clientY: 20 });
    fireEvent.pointerUp(s, { pointerId: 1, clientX: 40, clientY: 20 });
    expect(onChange).toHaveBeenLastCalledWith(180);
  });

  it("acota las fracciones de la cinta a [0, 1] aunque la posición pase del total", () => {
    render(ui({ fromPage: 500, value: null, total: 412, onChange: () => {} }));
    const s = screen.getByRole("slider");
    expect(s.style.getPropertyValue("--read")).toBe("1");
    expect(s.style.getPropertyValue("--mark")).toBe("1");
  });
});
