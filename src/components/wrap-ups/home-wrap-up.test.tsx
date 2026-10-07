// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OwnWrapUp } from "@/lib/wrap-ups/get-own-wrap-ups";
import { HomeWrapUp } from "./home-wrap-up";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
vi.mock("next/dynamic", () => ({ default: () => function Player({ wrapUp, onClose }: { wrapUp: OwnWrapUp; onClose: () => void }) {
  return <div role="dialog" aria-label={wrapUp.kind}><button onClick={onClose}>Cerrar crónica</button><button>{wrapUp.publishedPostId ? "Despublicar" : "Publicar"}</button></div>;
} }));
const week = { kind: "week" } as OwnWrapUp;
const month = { kind: "month" } as OwnWrapUp;
function props(wrapUp = week) {
  return { wrapUp, models: [], desktopCover: <span>Portada completa</span>, summary: <span>Resumen visual</span>, openLabel: "Abrir tu crónica" };
}
afterEach(cleanup);
describe("Crónica de Inicio", () => {
  it("no monta el reproductor que marca vista hasta pulsar", () => {
    render(<HomeWrapUp {...props()} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.body.style.overflow).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Abrir tu crónica" }));
    expect(screen.getByRole("dialog", { name: "week" })).toBeTruthy();
  });
  it("actualiza los controles de la crónica fijada aunque el resumen seleccione otra", () => {
    const result = render(<HomeWrapUp {...props()} available={[{ wrapUp: week, models: [] }]} />);
    fireEvent.click(screen.getByRole("button", { name: "Abrir tu crónica" }));
    const published = { ...week, publishedPostId: "post-nuevo" };
    result.rerender(<HomeWrapUp {...props(month)} available={[{ wrapUp: published, models: [] }, { wrapUp: month, models: [] }]} />);
    expect(screen.getByRole("dialog", { name: "week" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Despublicar" })).toBeTruthy();
  });
  it("mantiene la crónica abierta si el servidor selecciona otra tras marcarla vista", () => {
    const result = render(<HomeWrapUp {...props()} />);
    const trigger = screen.getByRole("button", { name: "Abrir tu crónica" });
    fireEvent.click(trigger);
    result.rerender(<HomeWrapUp {...props(month)} />);
    expect(screen.getByRole("dialog", { name: "week" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar crónica" }));
    expect(document.body.style.overflow).toBe("");
    expect(document.activeElement).toBe(trigger);
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog", { name: "month" })).toBeTruthy();
  });
});
