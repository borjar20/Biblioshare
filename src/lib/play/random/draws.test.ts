import { describe, expect, it } from "vitest";
import { drawFromBag, drawTeams, flipCoin, flipCoins, pickFirst, rollDice, shuffle } from "./draws";
import type { BagItem } from "./types";

// RNG determinista para tests: devuelve la secuencia dada, cíclica.
function seq(...values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

describe("rollDice", () => {
  it("mapea el rng al rango 1..caras", () => {
    expect(rollDice(3, 6, seq(0, 0.5, 0.999))).toEqual([1, 4, 6]);
  });
  it("rng en el borde alto no se sale del rango", () => {
    // 0.9999… * 6 = 5.999… → floor 5 → 6; nunca 7.
    expect(rollDice(1, 6, () => 0.9999999999)).toEqual([6]);
  });
  it("rechaza parámetros fuera de límites", () => {
    expect(() => rollDice(0, 6, seq(0))).toThrow();
    expect(() => rollDice(21, 6, seq(0))).toThrow();
    expect(() => rollDice(1, 1, seq(0))).toThrow();
    expect(() => rollDice(1, 1001, seq(0))).toThrow();
    expect(() => rollDice(1.5, 6, seq(0))).toThrow();
    expect(() => rollDice(1, 6.5, seq(0))).toThrow();
  });
  it("acepta los máximos exactos (20d1000)", () => {
    // Caza al mutante que estrecha el rango en uno (> MAX-1).
    expect(rollDice(20, 1000, () => 0)).toEqual(Array(20).fill(1));
  });
});

describe("flipCoin", () => {
  it("mitad baja cara, mitad alta cruz", () => {
    expect(flipCoin(() => 0.2)).toBe("heads");
    expect(flipCoin(() => 0.7)).toBe("tails");
  });
  it("el borde exacto 0.5 es cruz (el corte es estricto <0.5)", () => {
    expect(flipCoin(() => 0.5)).toBe("tails");
  });
});

describe("shuffle", () => {
  it("con rng constante 0 rota de forma conocida (un shuffle no-op no pasa)", () => {
    // Fisher-Yates con j=0 en cada paso: [a,b,c,d] → [b,c,d,a]. Verificado a
    // mano; una identidad que devuelva la entrada intacta falla aquí.
    expect(shuffle(["a", "b", "c", "d"], () => 0)).toEqual(["b", "c", "d", "a"]);
  });
  it("no muta la entrada", () => {
    const input = ["a", "b", "c"];
    shuffle(input, () => 0);
    expect(input).toEqual(["a", "b", "c"]);
  });
});

describe("pickFirst", () => {
  it("elige por índice del rng", () => {
    expect(pickFirst(["ana", "beto", "carla"], () => 0.5)).toBe("beto");
  });
  it("exige al menos 2 jugadores", () => {
    expect(() => pickFirst(["ana"], () => 0)).toThrow();
  });
});

describe("drawTeams", () => {
  it("particiona a todos con tamaños que difieren como mucho en 1", () => {
    const teams = drawTeams(["a", "b", "c", "d", "e"], 2, seq(0));
    expect(teams).toHaveLength(2);
    const all = teams.flat().sort();
    expect(all).toEqual(["a", "b", "c", "d", "e"]);
    const sizes = teams.map((t) => t.length).sort();
    expect(sizes).toEqual([2, 3]);
  });
  it("rechaza menos de 2 o más de n-1 equipos", () => {
    expect(() => drawTeams(["a", "b", "c"], 1, seq(0))).toThrow();
    expect(() => drawTeams(["a", "b", "c"], 3, seq(0))).toThrow();
  });
  it("acepta el máximo exacto n-1", () => {
    const teams = drawTeams(["a", "b", "c"], 2, seq(0));
    expect(teams).toHaveLength(2);
    expect(teams.flat().sort()).toEqual(["a", "b", "c"]);
  });
});

describe("drawFromBag", () => {
  const items: BagItem[] = [
    { name: "Rojo", count: 2 },
    { name: "Azul", count: 1 },
  ];
  it("pondera por restantes: los 2 primeros tickets son Rojo, el tercero Azul", () => {
    expect(drawFromBag(items, () => 0)).toBe("Rojo");
    expect(drawFromBag(items, () => 0.5)).toBe("Rojo"); // ticket 1 de 3
    expect(drawFromBag(items, () => 0.9)).toBe("Azul"); // ticket 2 de 3
  });
  it("ignora tipos a 0 restantes", () => {
    expect(drawFromBag([{ name: "Rojo", count: 0 }, { name: "Azul", count: 1 }], () => 0)).toBe(
      "Azul",
    );
  });
  it("bolsa vacía lanza", () => {
    expect(() => drawFromBag([], () => 0)).toThrow();
    expect(() => drawFromBag([{ name: "Rojo", count: 0 }], () => 0)).toThrow();
  });
});

describe("flipCoins", () => {
  it("respeta count y mapea el rng por moneda", () => {
    expect(flipCoins(3, seq(0.2, 0.7, 0.2))).toEqual(["heads", "tails", "heads"]);
  });
  it("rechaza count fuera de 1..5", () => {
    expect(() => flipCoins(0, seq(0))).toThrow();
    expect(() => flipCoins(6, seq(0))).toThrow();
    expect(() => flipCoins(1.5, seq(0))).toThrow();
  });
  it("acepta los extremos exactos (1 y 5)", () => {
    expect(flipCoins(1, () => 0)).toEqual(["heads"]);
    expect(flipCoins(5, () => 0)).toEqual(Array(5).fill("heads"));
  });
});
