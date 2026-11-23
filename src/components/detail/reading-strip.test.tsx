// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/es.json";
import type { ProgressSession } from "@/lib/sessions/types";
import { buildReadingStrip, type StripNote } from "@/lib/passes/reading-strip";

vi.mock("@/lib/sessions/actions", () => ({ deleteSession: vi.fn() }));
vi.mock("@/components/notes/note-form", () => ({ NoteForm: () => <textarea aria-label="nota" /> }));
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a> }));
import { ReadingStripCard } from "./reading-strip";

afterEach(cleanup);

const s = (id: string, date: string, page: number): ProgressSession => ({
  id, sessionDate: date, createdAt: `${date}T10:00:00Z`, durationMinutes: 30, position: { page }, hasPost: false,
});
const note = (key: string, page: number): StripNote => ({ key, kind: "note", page, createdAt: "2026-08-01T00:00:00Z" });

function renderStrip(sessions: ProgressSession[], notes: StripNote[] = []) {
  const strip = buildReadingStrip({ sessions, notes, totalPages: 400, currentPage: null, closed: false, complete: true });
  const noteNodes = Object.fromEntries(notes.map((n) => [n.key, <p key={n.key}>{`texto ${n.key}`}</p>]));
  render(
    <NextIntlClientProvider locale="es" messages={messages}>
      <ReadingStripCard strip={strip} itemId="b1" sessionsPassId="p1" currentYear={2026} noteNodes={noteNodes} showCloseHint={false} />
    </NextIntlClientProvider>,
  );
}
function renderPlaced(sessions: ProgressSession[], totalPages: number, currentPage: number | null, notes: StripNote[] = []) {
  const strip = buildReadingStrip({ sessions, notes, totalPages, currentPage, closed: false, complete: true });
  const noteNodes = Object.fromEntries(notes.map((n) => [n.key, <p key={n.key}>{`texto ${n.key}`}</p>]));
  render(
    <NextIntlClientProvider locale="es" messages={messages}>
      <ReadingStripCard strip={strip} itemId="b1" sessionsPassId="p1" currentYear={2026} noteNodes={noteNodes} showCloseHint={false} />
    </NextIntlClientProvider>,
  );
}
const four = [s("a", "2026-07-08", 40), s("b", "2026-07-20", 90), s("c", "2026-08-02", 150), s("d", "2026-08-10", 200)];

describe("ReadingStripCard", () => {
  it("conserva el h3 «Sesiones» con su enlace hermano (e2e)", () => {
    renderStrip(four);
    const heading = screen.getByRole("heading", { name: "Sesiones", level: 3 });
    expect(within(heading.parentElement!).getByRole("link", { name: "Registrar sesión" }).getAttribute("href")).toBe("/sesion/p1");
  });
  it("cifra la página actual", () => {
    renderStrip(four);
    expect(screen.getByTestId("reading-current-page").textContent).toBe("pág. 200");
  });
  it("abre por defecto la última sesión, con sus notas", () => {
    renderStrip(four, [note("note:1", 180), note("note:2", 60)]);
    const detail = screen.getByTestId("reading-strip-detail");
    expect(within(detail).getByText(/Sesión 4 · 10 ago/)).toBeTruthy();
    expect(within(detail).getByText("texto note:1")).toBeTruthy();
    expect(screen.queryByText("texto note:2")).toBeNull();
  });
  it("si la última sesión volvió atrás, abre el tramo más reciente que contiene la página actual", () => {
    // 0→40, 40→90, 90→150 y una corrección a 60: la página actual (60) es del
    // segundo tramo, y ahí caen la nota y el compositor.
    renderStrip([...four.slice(0, 3), s("d", "2026-08-10", 60)], [note("note:5", 60)]);
    const detail = screen.getByTestId("reading-strip-detail");
    expect(within(detail).getByText(/Sesión 2 · 20 jul/)).toBeTruthy();
    expect(within(detail).getByText("texto note:5")).toBeTruthy();
  });
  it("cada tramo se dibuja en sus páginas y el más reciente queda encima en una relectura", () => {
    renderPlaced([s("a", "2026-07-01", 120), s("b", "2026-07-02", 668), s("c", "2026-07-03", 120), s("d", "2026-07-04", 240)], 669, 240);
    const reread = screen.getByRole("button", { name: /páginas 120 a 240/ });
    const first = screen.getByRole("button", { name: /páginas 120 a 668/ });
    expect(parseFloat(reread.style.left)).toBeCloseTo((120 / 669) * 100, 5);
    expect(Number(reread.style.zIndex)).toBeGreaterThan(Number(first.style.zIndex));
  });
  it("el compositor solo está en el tramo de la página actual; un tramo antiguo enseña sus notas sin compositor", () => {
    renderStrip(four, [note("note:2", 60)]);
    expect(within(screen.getByTestId("reading-strip-detail")).getByRole("textbox", { name: "nota" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /20 jul: páginas 40 a 90/ }));
    const detail = screen.getByTestId("reading-strip-detail");
    expect(within(detail).getByText("texto note:2")).toBeTruthy();
    expect(within(detail).queryByRole("textbox", { name: "nota" })).toBeNull();
  });
  it("tocar un tramo lo abre; tocarlo otra vez, o Escape, lo cierra", () => {
    renderStrip(four, [note("note:2", 60)]);
    const tramo = screen.getByRole("button", { name: /20 jul: páginas 40 a 90/ });
    fireEvent.click(tramo);
    expect(tramo.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("texto note:2")).toBeTruthy();
    fireEvent.click(tramo);
    expect(screen.queryByTestId("reading-strip-detail")).toBeNull();
    fireEvent.click(tramo);
    fireEvent.keyDown(tramo, { key: "Escape" });
    expect(screen.queryByTestId("reading-strip-detail")).toBeNull();
  });
  it("Escape dentro del compositor no cierra el tramo", () => {
    renderStrip(four);
    fireEvent.keyDown(screen.getByRole("textbox", { name: "nota" }), { key: "Escape" });
    expect(screen.getByTestId("reading-strip-detail")).toBeTruthy();
  });
  it("la pastilla de una fila abre su tramo", () => {
    renderStrip(four, [note("note:9", 120)]);
    fireEvent.click(screen.getByRole("button", { name: "1 nota" }));
    expect(within(screen.getByTestId("reading-strip-detail")).getByText(/Sesión 3/)).toBeTruthy();
  });
  it("solo enseña las tres últimas; el historial por meses, a un toque y con el mes en curso abierto", () => {
    renderStrip(four);
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: "Ver las 4 sesiones, por mes" }));
    const months = screen.getAllByTestId("session-month");
    expect(months).toHaveLength(2);
    expect(months[0].hasAttribute("open")).toBe(true);
    expect(months[1].hasAttribute("open")).toBe(false);
  });
  it("con tres sesiones o menos no hay historial", () => {
    renderStrip(four.slice(0, 3));
    expect(screen.queryByRole("button", { name: /Ver las/ })).toBeNull();
  });
  it("sin sesiones: el vacío único con el compositor", () => {
    renderStrip([]);
    expect(screen.getByText(/Todavía no has registrado ninguna sesión/)).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "nota" })).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Sesiones a lo largo del libro" })).not.toBeNull();
  });
});
