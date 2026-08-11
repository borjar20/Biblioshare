import { describe, expect, it } from "vitest";
import {
  MARK_ACCENT,
  accentKeyFor,
  LEYENDA_MARCAS,
  LEYENDA_EVENTOS,
  LEYENDA_LANZAMIENTOS,
  type MarkAccentKey,
} from "./mark-accent";

function marca(over: Partial<Parameters<typeof accentKeyFor>[0]> = {}) {
  return {
    markKind: "evento" as const,
    eventType: "encuentro" as const,
    medium: null,
    ...over,
  };
}

describe("accentKeyFor", () => {
  it("markKind manda: un hito de una actividad evento sigue siendo hito", () => {
    expect(accentKeyFor(marca({ markKind: "hito", eventType: null }))).toBe("hito");
  });

  it("inicio y cierre pasan tal cual", () => {
    expect(accentKeyFor(marca({ markKind: "inicio", eventType: null }))).toBe("inicio");
    expect(accentKeyFor(marca({ markKind: "cierre", eventType: null }))).toBe("cierre");
  });

  it("encuentro y fecha_destacada tienen su clave", () => {
    expect(accentKeyFor(marca({ eventType: "encuentro" }))).toBe("encuentro");
    expect(accentKeyFor(marca({ eventType: "fecha_destacada" }))).toBe("fecha_destacada");
  });

  it("cada medio de lanzamiento tiene su clave", () => {
    expect(accentKeyFor(marca({ eventType: "lanzamiento", medium: "book" }))).toBe(
      "lanzamiento_book",
    );
    expect(accentKeyFor(marca({ eventType: "lanzamiento", medium: "movie" }))).toBe(
      "lanzamiento_movie",
    );
    expect(accentKeyFor(marca({ eventType: "lanzamiento", medium: "series" }))).toBe(
      "lanzamiento_series",
    );
  });

  it("un lanzamiento SIN ítem cae a fecha_destacada, no revienta", () => {
    expect(accentKeyFor(marca({ eventType: "lanzamiento", medium: null }))).toBe(
      "fecha_destacada",
    );
  });

  it("una marca de evento sin eventType cae a fecha_destacada", () => {
    // No debería pasar (core.ts siempre lo puebla para kind evento), pero la
    // función es total: no puede devolver undefined y dejar la celda sin color.
    expect(accentKeyFor(marca({ eventType: null }))).toBe("fecha_destacada");
  });
});

describe("la leyenda cubre TODO MARK_ACCENT", () => {
  // El test que de verdad importa: si alguien añade una clave al Record y no la
  // coloca en ninguna fila, la leyenda dejaría de explicar un color que la
  // rejilla sí pinta -- la divergencia contra la que avisa el comentario del
  // fichero.
  it("las tres filas particionan las claves, sin huecos ni repetidos", () => {
    const todas = Object.keys(MARK_ACCENT).sort();
    const enLeyenda = [...LEYENDA_MARCAS, ...LEYENDA_EVENTOS, ...LEYENDA_LANZAMIENTOS].sort();
    expect(enLeyenda).toEqual(todas);
    expect(new Set(enLeyenda).size).toBe(enLeyenda.length);
  });

  it("la fila de marcas va en el orden de desempate de la rejilla", () => {
    const esperado: MarkAccentKey[] = ["inicio", "hito", "cierre"];
    expect(LEYENDA_MARCAS).toEqual(esperado);
  });

  it("la fila de lanzamientos va libro, película, serie", () => {
    const esperado: MarkAccentKey[] = [
      "lanzamiento_book",
      "lanzamiento_movie",
      "lanzamiento_series",
    ];
    expect(LEYENDA_LANZAMIENTOS).toEqual(esperado);
  });
});

describe("los colores de evento son distinguibles entre sí", () => {
  it("las cinco clases de evento tienen cinco barras distintas", () => {
    const barras = [
      "encuentro",
      "fecha_destacada",
      "lanzamiento_book",
      "lanzamiento_movie",
      "lanzamiento_series",
    ].map((k) => MARK_ACCENT[k as MarkAccentKey].bar);
    expect(new Set(barras).size).toBe(5);
  });

  it("cada clave tiene su propio icono, no todos el mismo", () => {
    const iconos = new Set(Object.values(MARK_ACCENT).map((a) => a.Icon));
    expect(iconos.size).toBe(Object.keys(MARK_ACCENT).length);
  });
});
