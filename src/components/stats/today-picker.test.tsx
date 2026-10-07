// @vitest-environment jsdom
import Link from "next/link";
import { useState } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TodayPicker } from "./today-picker";

let mobile = true;
let pathname = "/";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
const listeners = new Set<() => void>();
function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(count + 1)}>Sesiones de la obra: {count}</button>;
}
const entries = [{ id: "a", card: <Counter />, mini: <span>Otra vista</span>, thumb: <span>Portada</span>, summary: <span>Libro elegido · 34%</span>, quickAction: <Link href="/sesion/pase-a">Sesión directa</Link>, focusLabel: "Elegir A", announceLabel: "A elegida" }];
const labels = { title: "Lo que disfrutas", openLabel: "Ampliar lo que disfrutas", closeLabel: "Cerrar vista completa" };

beforeEach(() => {
  mobile = true; pathname = "/"; listeners.clear();
  vi.stubGlobal("matchMedia", (query: string) => ({ get matches() { return query.includes("width") ? mobile : true; }, media: query, addEventListener: (_: string, fn: () => void) => listeners.add(fn), removeEventListener: (_: string, fn: () => void) => listeners.delete(fn) }));
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); this.dispatchEvent(new Event("close")); };
  vi.stubGlobal("scrollTo", vi.fn());
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function view() { return render(<TodayPicker entries={entries} keepGoingLabel="Continúa" {...{ panelLabels: labels }} />); }

describe("Hoy resumido en móvil", () => {
  it("presenta portada/progreso y sesión directa antes de abrir los controles completos", () => {
    view();
    expect(screen.getByRole("button", { name: labels.openLabel })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Sesión directa" }).getAttribute("href")).toBe("/sesion/pase-a");
    expect(screen.queryByRole("button", { name: "Sesiones de la obra: 0" })).toBeNull();
  });
  it("abrir y cerrar no remonta el contenido completo y devuelve el foco", async () => {
    view(); const trigger = screen.getByRole("button", { name: labels.openLabel });
    fireEvent.click(trigger);
    const dialog = await screen.findByRole("dialog", { name: labels.title });
    fireEvent.click(within(dialog).getByRole("button", { name: "Sesiones de la obra: 0" }));
    fireEvent.click(within(dialog).getByRole("button", { name: labels.closeLabel }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(trigger);
    fireEvent.click(trigger);
    expect(await screen.findByRole("button", { name: "Sesiones de la obra: 1" })).toBeTruthy();
  });
  it("al navegar cierra la capa y libera el scroll antes de volver", async () => {
    const result = view(); fireEvent.click(screen.getByRole("button", { name: labels.openLabel }));
    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(document.body.style.overflow).toBe("hidden");
    pathname = "/sesion/pase-a";
    result.rerender(<TodayPicker entries={entries} keepGoingLabel="Continúa" panelLabels={labels} />);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.body.style.overflow).toBe("");
    pathname = "/";
    result.rerender(<TodayPicker entries={entries} keepGoingLabel="Continúa" panelLabels={labels} />);
    fireEvent.click(screen.getByRole("button", { name: labels.openLabel }));
    expect(await screen.findByRole("dialog")).toBeTruthy();
  });
  it("al pasar a escritorio conserva la obra y libera la capa", async () => {
    view(); fireEvent.click(screen.getByRole("button", { name: labels.openLabel }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Sesiones de la obra: 0" }));
    act(() => { mobile = false; listeners.forEach((fn) => fn()); });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByRole("button", { name: "Sesiones de la obra: 1" })).toBeTruthy();
    expect(document.body.style.overflow).toBe("");
  });
});
