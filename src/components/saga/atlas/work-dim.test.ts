import { describe, expect, it } from "vitest";
import { DIM, workDim } from "./work-dim";

const w = (extra: Partial<Parameters<typeof workDim>[0]> = {}) => ({ role: null, step: 1, state: "done" as const, skipped: false, ...extra });
const off = { lens: "orden" as const, role: null, hasItinerary: false, progress: false };

describe("workDim", () => {
  it("sin capas ni filtros, todo a 1", () => {
    expect(workDim(w({ state: "todo", skipped: true }), off)).toEqual({ opacity: 1, filtered: false });
  });

  it("Progreso: pendiente 0,4, saltada 0,3, leída y ahora 1", () => {
    const on = { ...off, progress: true };
    expect(workDim(w({ state: "todo" }), on).opacity).toBe(DIM.todo);
    expect(workDim(w({ state: "todo", skipped: true }), on).opacity).toBe(DIM.skipped);
    expect(workDim(w({ state: "now" }), on).opacity).toBe(1);
    expect(workDim(w({ state: "todo" }), on).filtered).toBe(false);
  });

  it("gana el mínimo: fuera de ruta (0,3) con pendiente (0,4) da 0,3", () => {
    const r = workDim(w({ step: null, state: "todo" }), { ...off, hasItinerary: true, progress: true });
    expect(r).toEqual({ opacity: DIM.offRoute, filtered: true });
  });

  it("el rol solo atenúa en la lente Rol", () => {
    expect(workDim(w({ role: "relato" }), { ...off, lens: "rol", role: "precuela" })).toEqual({ opacity: DIM.role, filtered: true });
    expect(workDim(w({ role: "relato" }), { ...off, role: "precuela" }).filtered).toBe(false);
  });
});
