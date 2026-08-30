import { describe, expect, it } from "vitest";
import { fitDamageChips, type DamageRow } from "./damage-strip";

const fila = (commanderId: string, amount: number, lethal = false): DamageRow => ({
  commanderId,
  commanderName: commanderId,
  sourceId: commanderId.split("-")[0],
  amount,
  lethal,
});

describe("qué fichas de daño caben en la tira", () => {
  it("si caben todas, no hay resumen", () => {
    const rows = [fila("ana-c1", 5), fila("borja-c1", 3)];
    expect(fitDamageChips(rows, 3)).toEqual({ visible: rows, overflow: 0 });
  });

  it("lo que no cabe se cuenta, no se esconde en silencio", () => {
    const rows = [fila("ana-c1", 5), fila("borja-c1", 3), fila("carlos-c1", 1)];
    const fit = fitDamageChips(rows, 2);
    expect(fit.visible).toHaveLength(2);
    expect(fit.overflow).toBe(1);
  });

  it("las letales SIEMPRE se ven, aunque lleguen las últimas", () => {
    // La condición de derrota son 21 de UN MISMO comandante: esconder la que ya ha
    // llegado sería esconder justo la que decide la partida.
    const rows = [fila("ana-c1", 2), fila("borja-c1", 3), fila("carlos-c1", 21, true)];
    const fit = fitDamageChips(rows, 1);
    expect(fit.visible.map((r) => r.commanderId)).toEqual(["carlos-c1"]);
    expect(fit.overflow).toBe(2);
  });

  it("si hay más letales que hueco, se enseñan todas: cede el hueco, no la información", () => {
    const rows = [fila("ana-c1", 21, true), fila("borja-c1", 22, true), fila("carlos-c1", 4)];
    const fit = fitDamageChips(rows, 1);
    expect(fit.visible).toHaveLength(2);
    expect(fit.visible.every((r) => r.lethal)).toBe(true);
    expect(fit.overflow).toBe(1);
  });

  it("lo visible conserva el orden de asiento, no el de prioridad", () => {
    // Si no, los números bailarían de sitio entre toques.
    const rows = [fila("ana-c1", 2), fila("borja-c1", 21, true), fila("carlos-c1", 3)];
    const fit = fitDamageChips(rows, 2);
    expect(fit.visible.map((r) => r.commanderId)).toEqual(["ana-c1", "borja-c1"]);
  });

  it("sin daño recibido, ni fichas ni resumen", () => {
    expect(fitDamageChips([], 3)).toEqual({ visible: [], overflow: 0 });
  });

  it("un hueco de cero deja la tira vacía y lo cuenta todo", () => {
    // Alcanzable en el panel más estrecho antes de medir.
    const rows = [fila("ana-c1", 5), fila("borja-c1", 3)];
    expect(fitDamageChips(rows, 0)).toEqual({ visible: [], overflow: 2 });
  });

  it("con hueco de cero, una letal sigue viéndose", () => {
    const rows = [fila("ana-c1", 5), fila("borja-c1", 21, true)];
    const fit = fitDamageChips(rows, 0);
    expect(fit.visible.map((r) => r.commanderId)).toEqual(["borja-c1"]);
    expect(fit.overflow).toBe(1);
  });
});
