// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/es.json";
import type { StripSegment } from "@/lib/passes/reading-strip";
import { SessionRow } from "./session-row";

const actions = vi.hoisted(() => ({ deleteSession: vi.fn() }));
vi.mock("@/lib/sessions/actions", () => actions);
afterEach(() => { cleanup(); vi.restoreAllMocks(); actions.deleteSession.mockReset(); });

const seg = (over: Partial<StripSegment> = {}): StripSegment => ({
  sessionId: "s10", index: 10, from: 148, to: 190, pages: 42, advanced: true, date: "2026-08-14",
  minutes: 85, hasPost: false, monthKey: "2026-08", recency: 1, notes: [], ...over,
});

function row(segment: StripSegment, onShowNotes = vi.fn()) {
  render(
    <NextIntlClientProvider locale="es" messages={messages}>
      <ul><SessionRow segment={segment} scale={412} currentYear={2026} itemId="b1" onShowNotes={onShowNotes} /></ul>
    </NextIntlClientProvider>,
  );
  return onShowNotes;
}

describe("SessionRow", () => {
  it("fecha absoluta, tramo, páginas y duración", () => {
    row(seg());
    expect(screen.getByText("14 ago")).toBeTruthy();
    expect(screen.getByText("pág. 148 → 190 · 42 páginas · 1 h 25 min")).toBeTruthy();
  });
  it("una sesión que no avanza dice solo su página", () => {
    row(seg({ from: 40, to: 40, pages: 0, advanced: false, minutes: null }));
    expect(screen.getByText("pág. 40")).toBeTruthy();
  });
  it("la pastilla de notas pide abrir su tramo", () => {
    const onShow = row(seg({ notes: [{ key: "note:1", kind: "note", page: 150, createdAt: "x" }] }));
    fireEvent.click(screen.getByRole("button", { name: "1 nota" }));
    expect(onShow).toHaveBeenCalledWith("s10");
  });
  it("sin notas no hay pastilla", () => {
    row(seg());
    expect(screen.queryByRole("button", { name: /nota/ })).toBeNull();
  });
  it("borrar una sesión con publicación pregunta antes", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    row(seg({ hasPost: true }));
    fireEvent.click(screen.getByRole("button", { name: "Acciones de la sesión" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Eliminar" }));
    expect(confirm).toHaveBeenCalled();
    expect(actions.deleteSession).not.toHaveBeenCalled();
  });
});
