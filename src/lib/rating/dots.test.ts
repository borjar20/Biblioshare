import { describe, it, expect } from "vitest";
import { ratingFromFraction, toDots, formatDots } from "./dots";

describe("toDots", () => {
  it("convierte la nota 1-10 a la escala de 5 dots", () => {
    expect(toDots(10)).toBe(5);
    expect(toDots(9)).toBe(4.5);
    expect(toDots(1)).toBe(0.5);
  });

  it("propaga la ausencia de nota", () => {
    expect(toDots(null)).toBeNull();
  });
});

describe("formatDots", () => {
  it("formatea en es-ES con una decimal como mucho", () => {
    expect(formatDots(9)).toBe("4,5");
    expect(formatDots(8)).toBe("4");
    expect(formatDots(null)).toBeNull();
  });
});

// La aritmética del gesto de arrastre táctil (F4-010 de la auditoría 2026-08).
// Lo que se prueba aquí es lo que hacía imposible puntuar a dedo: el control
// dibuja cinco dots de 10px partidos en mitades de 3,5-5px, y sin un mapeo
// continuo sobre TODA la fila la nota salía ±1 respecto a la intención.
describe("ratingFromFraction", () => {
  it("reparte diez tramos iguales sobre el ancho de la fila", () => {
    // El centro de cada tramo n/10 tiene que dar la nota n.
    for (let nota = 1; nota <= 10; nota++) {
      const centro = (nota - 0.5) / 10;
      expect(ratingFromFraction(centro)).toBe(nota);
    }
  });

  it("es monótona: avanzar el dedo nunca baja la nota", () => {
    let previa = 0;
    for (let paso = 0; paso <= 100; paso++) {
      const nota = ratingFromFraction(paso / 100);
      expect(nota).toBeGreaterThanOrEqual(previa);
      previa = nota;
    }
  });

  it("recorta fuera de la fila en vez de salirse de la escala", () => {
    // Arrastrar más allá del borde izquierdo no puede dar 0 ni negativo: la
    // ausencia de nota es `null`, no un cero, y no existe la nota 0. En el
    // borde exacto `Math.ceil(0)` sería 0, de ahí el suelo explícito.
    expect(ratingFromFraction(-2)).toBe(1);
    expect(ratingFromFraction(0)).toBe(1);
    expect(ratingFromFraction(1)).toBe(10);
    expect(ratingFromFraction(3)).toBe(10);
  });

  it("no propaga un NaN de una fila sin medir", () => {
    // `getBoundingClientRect().width === 0` ya se filtra en el componente, pero
    // un NaN colado aquí acabaría escribiendo una nota inválida en la BD.
    expect(ratingFromFraction(Number.NaN)).toBe(1);
    expect(ratingFromFraction(Number.POSITIVE_INFINITY)).toBe(1);
  });

  it("las notas impares caen en la mitad izquierda de su dot", () => {
    // Coherencia con el dibujo: el dot i (0-4) cubre las notas 2i+1 y 2i+2, y
    // la mitad izquierda es la impar. Sin esto el globo diría una nota y el
    // relleno enseñaría otra.
    expect(ratingFromFraction(0.05)).toBe(1);
    expect(ratingFromFraction(0.15)).toBe(2);
    expect(ratingFromFraction(0.85)).toBe(9);
    expect(ratingFromFraction(0.95)).toBe(10);
  });
});
