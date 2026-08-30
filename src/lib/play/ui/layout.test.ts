import { describe, expect, it } from "vitest";
import { defaultLayout, layoutOptions, lifeFontSize, resolveLayout } from "./layout";

const ORIENTACIONES = ["portrait", "landscape"] as const;
const MESAS = [2, 3, 4, 5, 6];

describe("familias de reparto disponibles", () => {
  it("a dos jugadores no hay cabecera: no hay bloque central que dejar intacto", () => {
    expect(layoutOptions(2, "portrait")).toEqual(["rows", "flat"]);
    expect(layoutOptions(2, "landscape")).toEqual(["rows", "flat"]);
  });

  it("de cuatro en adelante sí hay cabecera", () => {
    expect(layoutOptions(4, "portrait")).toContain("head");
    expect(layoutOptions(5, "portrait")).toContain("head");
  });

  it("a seis, las dos cabeceras SOLO existen tumbado", () => {
    // De pie no cabe: dos laterales dejan los paneles centrales en 81 px y dos
    // cifras en mono necesitan 93. Medido en el canvas de la fase 1a.
    expect(layoutOptions(6, "portrait")).not.toContain("head");
    expect(layoutOptions(6, "landscape")).toContain("head");
  });

  it("«todos igual» está siempre: es la salida accesible, no una opción de lujo", () => {
    for (const players of MESAS) {
      for (const orientation of ORIENTACIONES) {
        expect(layoutOptions(players, orientation)).toContain("flat");
      }
    }
  });
});

describe("reparto por defecto", () => {
  it("el por defecto es siempre una opción válida para ese número y orientación", () => {
    for (const players of MESAS) {
      for (const orientation of ORIENTACIONES) {
        expect(layoutOptions(players, orientation)).toContain(defaultLayout(players, orientation));
      }
    }
  });

  it("a cinco el por defecto es la cabecera: pasar de 4 a 5 no recoloca a nadie", () => {
    expect(defaultLayout(5, "portrait")).toBe("head");
    expect(defaultLayout(5, "landscape")).toBe("head");
  });

  it("a seis el por defecto cambia con el giro, y es el único que lo hace", () => {
    expect(defaultLayout(6, "portrait")).toBe("rows");
    expect(defaultLayout(6, "landscape")).toBe("head");
    for (const players of [2, 3, 4]) {
      expect(defaultLayout(players, "portrait")).toBe(defaultLayout(players, "landscape"));
    }
  });
});

describe("resolveLayout", () => {
  it("coloca a todo el mundo, una vez, con su asiento", () => {
    for (const players of MESAS) {
      for (const orientation of ORIENTACIONES) {
        for (const family of layoutOptions(players, orientation)) {
          const layout = resolveLayout(players, orientation, family);
          const seats = layout.seats.map((s) => s.seat).sort((a, b) => a - b);
          expect(seats, `${players}/${orientation}/${family}`).toEqual(
            Array.from({ length: players }, (_, i) => i),
          );
        }
      }
    }
  });

  it("cada área declarada aparece en la rejilla, y la consola también", () => {
    for (const players of MESAS) {
      for (const orientation of ORIENTACIONES) {
        for (const family of layoutOptions(players, orientation)) {
          const layout = resolveLayout(players, orientation, family);
          for (const seat of layout.seats) {
            expect(layout.areas, `${players}/${orientation}/${family}`).toContain(seat.area);
          }
          expect(layout.areas).toContain(layout.consoleArea);
        }
      }
    }
  });

  it("la rejilla es rectangular: todas las filas tienen las mismas celdas", () => {
    // Una fila con celdas de menos hace que el navegador descarte
    // `grid-template-areas` ENTERO, en silencio, y el tablero cae a una columna.
    for (const players of MESAS) {
      for (const orientation of ORIENTACIONES) {
        for (const family of layoutOptions(players, orientation)) {
          const layout = resolveLayout(players, orientation, family);
          const filas = layout.areas.match(/"[^"]+"/g) ?? [];
          const anchos = new Set(filas.map((f) => f.replace(/"/g, "").trim().split(/\s+/).length));
          expect(anchos.size, `${players}/${orientation}/${family}: ${layout.areas}`).toBe(1);
          expect([...anchos][0]).toBe(layout.columns.trim().split(/\s+/).length);
          expect(filas.length).toBe(layout.rows.trim().split(/\s+/).length);
        }
      }
    }
  });

  it("en filas, el sobrante de un número impar va ABAJO a ancho entero", () => {
    // Es el sitio de quien sostiene el móvil.
    const layout = resolveLayout(3, "portrait", "rows");
    const abajo = layout.seats.filter((s) => s.rotation === 0);
    expect(abajo).toHaveLength(1);
    expect(abajo[0].seat).toBe(2);
  });

  it("la fila de arriba va girada 180 y la de abajo no: se leen desde cada lado", () => {
    const layout = resolveLayout(4, "portrait", "rows");
    expect(layout.seats.filter((s) => s.rotation === 180)).toHaveLength(2);
    expect(layout.seats.filter((s) => s.rotation === 0)).toHaveLength(2);
  });

  it("«todos igual» no gira a nadie", () => {
    for (const players of MESAS) {
      const layout = resolveLayout(players, "portrait", "flat");
      expect(layout.seats.every((s) => s.rotation === 0)).toBe(true);
    }
  });

  it("a cinco con cabecera, el 2x2 queda intacto y solo el quinto va de canto", () => {
    const layout = resolveLayout(5, "portrait", "head");
    const canto = layout.seats.filter((s) => s.rotation === 90 || s.rotation === -90);
    expect(canto).toHaveLength(1);
    expect(canto[0].seat).toBe(4);
    // Los cuatro primeros siguen donde estaban: dos arriba girados, dos abajo.
    expect(layout.seats.filter((s) => s.rotation === 180).map((s) => s.seat)).toEqual([0, 1]);
    expect(layout.seats.filter((s) => s.rotation === 0).map((s) => s.seat)).toEqual([2, 3]);
  });

  it("a seis tumbado con cabeceras hay dos de canto, uno a cada lado", () => {
    const layout = resolveLayout(6, "landscape", "head");
    const canto = layout.seats.filter((s) => s.rotation === 90 || s.rotation === -90);
    expect(canto).toHaveLength(2);
    expect(new Set(canto.map((s) => s.rotation)).size).toBe(2);
  });

  it("la consola es banda de pie y flotante tumbada (decisión 2026-08-29 (6))", () => {
    for (const players of MESAS) {
      for (const family of layoutOptions(players, "portrait")) {
        expect(resolveLayout(players, "portrait", family).consoleMode).toBe("band");
      }
      for (const family of layoutOptions(players, "landscape")) {
        expect(resolveLayout(players, "landscape", family).consoleMode).toBe("floating");
      }
    }
  });

  it("una familia imposible para ese número cae al por defecto, no pinta una mesa rota", () => {
    // Alcanzable: la preferencia vive en localStorage y la siguiente partida puede
    // tener otro número de jugadores.
    const layout = resolveLayout(6, "portrait", "head");
    expect(layout.family).toBe(defaultLayout(6, "portrait"));
    expect(layout.seats).toHaveLength(6);
  });
});

describe("tamaño del número de vidas", () => {
  it("el panel de una mesa de 4 de pie da el número grande", () => {
    expect(lifeFontSize({ width: 190, height: 172, digits: 2 })).toBe(75);
  });

  it("la tercera cifra lo baja: a 78 px tres cifras se quedan sin aire", () => {
    const dos = lifeFontSize({ width: 190, height: 172, digits: 2 });
    const tres = lifeFontSize({ width: 190, height: 172, digits: 3 });
    expect(tres).toBeLessThan(dos);
  });

  it("nunca pasa del techo ni baja del suelo legible", () => {
    expect(lifeFontSize({ width: 900, height: 900, digits: 1 })).toBe(78);
    expect(lifeFontSize({ width: 40, height: 40, digits: 3 })).toBe(28);
  });

  it("es monótono: un panel más alto nunca da un número más pequeño", () => {
    const bajo = lifeFontSize({ width: 190, height: 120, digits: 2 });
    const alto = lifeFontSize({ width: 190, height: 172, digits: 2 });
    expect(alto).toBeGreaterThanOrEqual(bajo);
  });

  it("un panel de tamaño cero no devuelve NaN ni un número negativo", () => {
    // Primer render antes de que mida el ResizeObserver.
    expect(lifeFontSize({ width: 0, height: 0, digits: 2 })).toBe(28);
  });
});
