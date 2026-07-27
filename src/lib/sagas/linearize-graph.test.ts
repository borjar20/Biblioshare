import { describe, expect, it } from "vitest";
import { linearizeGraph } from "./linearize-graph";

const n = (key: string, thread: string, position: number) => ({ key, thread, position });

// Rota el array N veces (no es una permutación exhaustiva: basta con romper
// el orden de llegada de `nodes` de varias formas distintas para probar que
// `linearizeGraph` no depende de él).
function permutaciones<T>(items: T[], n: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < n; i++) {
    const cut = i % items.length;
    result.push([...items.slice(cut), ...items.slice(0, cut)]);
  }
  return result;
}

describe("linearizeGraph", () => {
  it("sin aristas, agrupa por hilo y ordena por posición dentro de cada uno", () => {
    expect(
      linearizeGraph([n("b2", "B", 2), n("a2", "A", 2), n("a1", "A", 1), n("b1", "B", 1)], []),
    ).toEqual(["a1", "a2", "b1", "b2"]);
  });

  it("una arista que cruza fuerza el orden entre hilos", () => {
    // A2 -> B1: B1 no puede salir hasta que A2 haya salido, aunque «B» empiece antes.
    expect(
      linearizeGraph([n("a1", "A", 1), n("a2", "A", 2), n("b1", "B", 1)], [{ from: "a2", to: "b1" }]),
    ).toEqual(["a1", "a2", "b1"]);
  });

  it("el hilo que se está leyendo gana al alfabético", () => {
    // Con B1 y A2 listos a la vez tras A1... sigue B, en vez de saltar a A.
    expect(
      linearizeGraph([n("a1", "A", 1), n("a2", "A", 2), n("b1", "B", 1), n("b2", "B", 2)],
        [{ from: "a1", to: "b1" }]),
    ).toEqual(["a1", "b1", "b2", "a2"]);
  });

  it("es determinista: cinco permutaciones de la misma entrada dan el mismo orden", () => {
    // Mismo criterio con el que se verificó el comparador de la #198.
    const nodes = [n("a1", "A", 1), n("a2", "A", 2), n("b1", "B", 1)];
    const edges = [{ from: "a2", to: "b1" }];
    const esperado = linearizeGraph(nodes, edges);
    for (const permutada of permutaciones(nodes, 5)) {
      expect(linearizeGraph(permutada, edges)).toEqual(esperado);
    }
  });

  it("un ciclo no cuelga ni pierde nodos", () => {
    expect(
      linearizeGraph([n("a", "A", 1), n("b", "A", 2)], [{ from: "a", to: "b" }, { from: "b", to: "a" }]),
    ).toHaveLength(2);
  });
});
