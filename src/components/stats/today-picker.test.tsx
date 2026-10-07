// @vitest-environment jsdom
import Link from "next/link";
import Image from "next/image";
import { Activity, useState } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HomeExpandable, HomePanelsProvider } from "@/components/home/home-expandable";
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
const labels = { title: "Lo que disfrutas", openLabel: "Ampliar lo que disfrutas", closeLabel: "Recoger" };

beforeEach(() => {
  mobile = true; pathname = "/"; listeners.clear();
  vi.stubGlobal("matchMedia", (query: string) => ({ get matches() { return query.includes("width") ? mobile : true; }, media: query, addEventListener: (_: string, fn: () => void) => listeners.add(fn), removeEventListener: (_: string, fn: () => void) => listeners.delete(fn) }));
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); this.dispatchEvent(new Event("close")); };
  vi.stubGlobal("scrollTo", vi.fn());
});
afterEach(() => { cleanup(); document.querySelectorAll("dialog[data-test-sheet]").forEach((sheet) => sheet.remove()); vi.unstubAllGlobals(); });
function view() { return render(<TodayPicker entries={entries} keepGoingLabel="Continúa" {...{ panelLabels: labels }} />); }

describe("Hoy resumido en móvil", () => {
  it("mantiene el título de la sección en el resumen y transforma la misma tarjeta sin remontarla", async () => {
    const title = "¿Qué has disfrutado hoy?";
    const card = <article><Image src="/portada-prueba.png" alt="Portada del libro" width={48} height={72} /><Counter /></article>;
    render(<TodayPicker entries={[{ ...entries[0], card }]} keepGoingLabel="Continúa" panelLabels={labels} sectionHeading={<h2>{title}</h2>} />);
    expect(screen.getByRole("heading", { name: title })).toBeTruthy();
    const cover = document.querySelector('img[alt="Portada del libro"]');
    const trigger = screen.getByRole("button", { name: labels.openLabel });
    fireEvent.click(trigger);
    expect(screen.getByRole("heading", { name: title })).toBeTruthy();
    expect(screen.getByRole("img", { name: "Portada del libro" })).toBe(cover);
    fireEvent.click(screen.getByRole("button", { name: "Sesiones de la obra: 0" }));
    fireEvent.click(within(screen.getByRole("region", { name: labels.title })).getByRole("button", { name: `${labels.closeLabel}: ${labels.title}` }));
    expect(screen.getByRole("heading", { name: title })).toBeTruthy();
    expect(document.querySelector('img[alt="Portada del libro"]')).toBe(cover);
    fireEvent.click(trigger);
    expect(screen.getByRole("button", { name: "Sesiones de la obra: 1" })).toBeTruthy();
  });

  it("presenta portada/progreso y sesión directa antes de abrir los controles completos", () => {
    view();
    expect(screen.getByRole("button", { name: labels.openLabel })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Sesión directa" }).getAttribute("href")).toBe("/sesion/pase-a");
    expect(screen.queryByRole("button", { name: "Sesiones de la obra: 0" })).toBeNull();
  });
  it("abrir y cerrar no remonta el contenido completo y devuelve el foco", async () => {
    view(); const trigger = screen.getByRole("button", { name: labels.openLabel });
    fireEvent.click(trigger);
    const dialog = await screen.findByRole("region", { name: labels.title });
    fireEvent.click(within(dialog).getByRole("button", { name: "Sesiones de la obra: 0" }));
    fireEvent.click(within(dialog).getByRole("button", { name: `${labels.closeLabel}: ${labels.title}` }));
    await waitFor(() => expect(screen.getByRole("button", { name: labels.openLabel }).getAttribute("aria-expanded")).toBe("false"));
    expect(document.activeElement).toBe(trigger);
    fireEvent.click(trigger);
    expect(await screen.findByRole("button", { name: "Sesiones de la obra: 1" })).toBeTruthy();
  });
  it("al navegar recoge el detalle y conserva el scroll libre antes de volver", async () => {
    const result = view(); fireEvent.click(screen.getByRole("button", { name: labels.openLabel }));
    expect(await screen.findByRole("region", { name: labels.title })).toBeTruthy();
    expect(document.body.style.overflow).toBe("");
    expect(screen.queryByRole("dialog")).toBeNull();
    pathname = "/sesion/pase-a";
    result.rerender(<TodayPicker entries={entries} keepGoingLabel="Continúa" panelLabels={labels} />);
    await waitFor(() => expect(screen.queryByRole("button", { name: "Sesiones de la obra: 0" })).toBeNull());
    expect(document.body.style.overflow).toBe("");
    pathname = "/";
    result.rerender(<TodayPicker entries={entries} keepGoingLabel="Continúa" panelLabels={labels} />);
    fireEvent.click(screen.getByRole("button", { name: labels.openLabel }));
    expect(await screen.findByRole("region", { name: labels.title })).toBeTruthy();
  });
  it("abrir otro bloque recoge Hoy sin reiniciar sus controles ni bloquear la página", async () => {
    render(<HomePanelsProvider><TodayPicker entries={entries} keepGoingLabel="Continúa" panelLabels={labels} /><HomeExpandable title="Novedades" openLabel="Abrir novedades" closeLabel="Recoger novedades" summary={<span>Portadas</span>}><span>Detalle semanal</span></HomeExpandable></HomePanelsProvider>);
    fireEvent.click(screen.getByRole("button", { name: labels.openLabel }));
    const today = await screen.findByRole("region", { name: labels.title });
    fireEvent.click(within(today).getByRole("button", { name: "Sesiones de la obra: 0" }));
    fireEvent.click(screen.getByRole("button", { name: "Abrir novedades" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Sesiones de la obra: 1" })).toBeNull());
    expect(screen.getByRole("region", { name: "Novedades" })).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.body.style.overflow).toBe("");
    fireEvent.click(screen.getByRole("button", { name: labels.openLabel }));
    expect(await screen.findByRole("button", { name: "Sesiones de la obra: 1" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Abrir novedades" }).getAttribute("aria-expanded")).toBe("false");
  });
  it("Activity recoge el detalle al salir y conserva el estado funcional al volver", async () => {
    function content(mode: "visible" | "hidden") {
      return <Activity mode={mode}><HomePanelsProvider><TodayPicker entries={entries} keepGoingLabel="Continúa" panelLabels={labels} /></HomePanelsProvider></Activity>;
    }
    const result = render(content("visible"));
    fireEvent.click(screen.getByRole("button", { name: labels.openLabel }));
    fireEvent.click(await screen.findByRole("button", { name: "Sesiones de la obra: 0" }));
    pathname = "/sesion/pase-a";
    result.rerender(content("hidden"));
    pathname = "/";
    result.rerender(content("visible"));
    await waitFor(() => expect(screen.getByRole("button", { name: labels.openLabel }).getAttribute("aria-expanded")).toBe("false"));
    fireEvent.click(screen.getByRole("button", { name: labels.openLabel }));
    expect(await screen.findByRole("button", { name: "Sesiones de la obra: 1" })).toBeTruthy();
  });
  it("Escape respeta la hoja visible y no queda bloqueado por una hoja cacheada oculta", async () => {
    view();
    fireEvent.click(screen.getByRole("button", { name: labels.openLabel }));
    const sheet = document.createElement("dialog");
    sheet.setAttribute("open", "");
    sheet.dataset.testSheet = "true";
    let visible = true;
    sheet.getClientRects = () => (visible ? [{ width: 300, height: 500 }] : []) as unknown as DOMRectList;
    document.body.append(sheet);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByRole("button", { name: "Sesiones de la obra: 0" })).toBeTruthy();
    visible = false;
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("button", { name: "Sesiones de la obra: 0" })).toBeNull());
    sheet.remove();
  });
  it("al pasar a escritorio conserva la obra y libera la capa", async () => {
    view(); fireEvent.click(screen.getByRole("button", { name: labels.openLabel }));
    const dialog = await screen.findByRole("region", { name: labels.title });
    fireEvent.click(within(dialog).getByRole("button", { name: "Sesiones de la obra: 0" }));
    act(() => { mobile = false; listeners.forEach((fn) => fn()); });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByRole("button", { name: "Sesiones de la obra: 1" })).toBeTruthy();
    expect(document.body.style.overflow).toBe("");
  });
});
