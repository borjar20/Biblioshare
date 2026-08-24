// @vitest-environment jsdom
//
// Es el primer test de COMPONENTE del repo: hasta aquí, todo lo de paneles era
// lógica pura. La pragma de arriba vale solo para este fichero — `vitest.config.ts`
// declara `environment: "node"` para todo el proyecto, y cambiarlo metería un DOM
// en ~190 ficheros que no lo necesitan, con `window` disponible donde hoy no lo
// está: justo lo que hace que un import de servidor pase el test y reviente en
// producción.
//
// Qué se afirma aquí y por qué: las formas nuevas están en `SELF_DESCRIBING`
// (stat-panel.tsx), y eso es un CONTRATO, no una lista — obliga a que el gráfico
// escriba sus cifras y a que cada marca sea alcanzable con teclado. Sin estos
// tests, la única forma de saber que se incumple es que alguien navegue el muro
// con `Tab` y no llegue a ningún sitio.
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { derive } from "@/lib/stats/panel/derive";
import { UNITS, type PanelSpec } from "@/lib/stats/panel/types";
import { BulletChart, DumbbellChart, LollipopChart, WaffleChart } from "./charts";

afterEach(cleanup);

function spec(over: Partial<PanelSpec> = {}): PanelSpec {
  return {
    id: "t",
    title: "Autores mejor valorados",
    context: { period: "2026" },
    viz: "lollipop",
    unit: UNITS.stars,
    data: [
      { key: "a", label: "Le Guin", value: 4.7, detail: "6 obras" },
      { key: "b", label: "Calvino", value: 4.5, detail: "3 obras" },
      { key: "c", label: "Asimov", value: null },
    ],
    ...over,
  };
}

describe("lollipop", () => {
  it("escribe el valor exacto de cada punto: es lo que sustituye a la tabla", () => {
    const s = spec();
    render(<LollipopChart spec={s} derived={derive(s)} interactive />);
    expect(screen.getByText("4,7 ★")).toBeTruthy();
    expect(screen.getByText("4,5 ★")).toBeTruthy();
  });

  it("cada marca medida es focalizable y dice su dato completo", () => {
    const s = spec();
    render(<LollipopChart spec={s} derived={derive(s)} interactive />);
    const marca = screen.getByLabelText("Le Guin: 4,7 ★");
    expect(marca.getAttribute("tabindex")).toBe("0");
  });

  it("un hueco no se dibuja como cero ni entra en el recorrido de foco", () => {
    const s = spec();
    render(<LollipopChart spec={s} derived={derive(s)} interactive />);
    // `null` = no se midió. Se lee «Sin datos», nunca «0».
    expect(screen.queryByLabelText(/Asimov: 0/)).toBeNull();
    expect(screen.getByText("Sin datos")).toBeTruthy();
  });

  it("sin `interactive` nada es focalizable: en la cara el modal tapa el gráfico entero", () => {
    const s = spec();
    const { container } = render(<LollipopChart spec={s} derived={derive(s)} />);
    expect(container.querySelectorAll("[tabindex]")).toHaveLength(0);
  });

  it("con notas, la escala NO arranca en cero: entre 3,4 y 4,7 todo caería junto", () => {
    const s = spec({
      data: [
        { key: "a", label: "Alta", value: 4.7 },
        { key: "b", label: "Baja", value: 3.4 },
      ],
    });
    const { container } = render(<LollipopChart spec={s} derived={derive(s)} />);
    const anchos = [...container.querySelectorAll("[data-stem]")].map(
      (el) => (el as HTMLElement).style.width,
    );
    // Si arrancara en cero, 3,4 y 4,7 sobre un eje 0–4,7 darían tallos del 72 %
    // y el 100 %: casi indistinguibles. Con suelo en el mínimo, se separan.
    expect(anchos[0]).not.toBe(anchos[1]);
    expect(anchos[1]).toMatch(/max\(6px, [0-9.]+%\)/);
  });

  it("con obras (no notas) la escala SÍ arranca en cero: ahí el cero significa algo", () => {
    const s = spec({
      unit: UNITS.works,
      data: [
        { key: "a", label: "Alta", value: 10 },
        { key: "b", label: "Baja", value: 5 },
      ],
    });
    const { container } = render(<LollipopChart spec={s} derived={derive(s)} />);
    const stems = [...container.querySelectorAll("[data-stem]")] as HTMLElement[];
    // La mitad del valor es la mitad del tallo. Con suelo en el mínimo no lo sería.
    expect(stems[1].style.width).toBe("max(6px, 50%)");
  });
});

/**
 * El waffle sustituye al anillo por una razón del propio doc, no de gusto: el
 * principio 3 de `paneles-estadisticos.md` prohíbe que un dato exija medir un
 * área o un ángulo, y un sector de donut es exactamente eso. Las celdas se
 * CUENTAN. Estos tests defienden que se puedan contar de verdad.
 */
function reparto(over: Partial<PanelSpec> = {}): PanelSpec {
  return {
    id: "estados",
    title: "Estados",
    context: { period: "Ahora mismo" },
    viz: "waffle",
    unit: UNITS.works,
    // 610 + 240 = 850: por encima de las cien celdas, así que entra en el modo
    // «una celda = 1 %». Los tests de abajo que quieren el otro modo bajan el
    // dato a propósito.
    data: [
      { key: "book", label: "Libros", value: 610 },
      { key: "movie", label: "Películas", value: 240 },
    ],
    series: [
      { key: "book", label: "Libros", color: "var(--type-book)" },
      { key: "movie", label: "Películas", color: "var(--type-movie)" },
    ],
    ...over,
  };
}

describe("waffle", () => {
  it("con más de cien puntos pinta cien celdas y avisa de que cada una es 1 %", () => {
    const s = reparto();
    const { container } = render(<WaffleChart spec={s} derived={derive(s)} />);
    expect(container.querySelectorAll("[data-cell]")).toHaveLength(100);
    expect(screen.getByText(/cada celda/).textContent).toMatch(/1 %/);
  });

  it("con cien o menos, una celda es UNA obra y no hay redondeo que anunciar", () => {
    const s = reparto({
      data: [
        { key: "book", label: "Libros", value: 5 },
        { key: "movie", label: "Películas", value: 2 },
      ],
    });
    const { container } = render(<WaffleChart spec={s} derived={derive(s)} />);
    expect(container.querySelectorAll("[data-cell]")).toHaveLength(7);
    expect(screen.getByText(/cada celda/).textContent).toMatch(/1 obra/);
  });

  it("reparte por resto mayor: nunca 99 ni 101 celdas", () => {
    // Tres tercios de 100 dan 33,33 cada uno: redondear por separado da 99.
    const s = reparto({
      data: [
        { key: "a", label: "A", value: 100 },
        { key: "b", label: "B", value: 100 },
        { key: "c", label: "C", value: 100 },
      ],
      series: [
        { key: "a", label: "A", color: "var(--type-book)" },
        { key: "b", label: "B", color: "var(--type-movie)" },
        { key: "c", label: "C", color: "var(--type-series)" },
      ],
    });
    const { container } = render(<WaffleChart spec={s} derived={derive(s)} />);
    expect(container.querySelectorAll("[data-cell]")).toHaveLength(100);
  });

  it("un hueco no ocupa celdas: `null` no es cero", () => {
    const s = reparto({
      data: [
        { key: "book", label: "Libros", value: 10 },
        { key: "movie", label: "Películas", value: null },
      ],
    });
    const { container } = render(<WaffleChart spec={s} derived={derive(s)} />);
    expect(container.querySelectorAll("[data-cell]")).toHaveLength(10);
  });

  it("la rejilla va aria-hidden: cien nodos sueltos no son un dato, la leyenda sí", () => {
    const s = reparto();
    const { container } = render(<WaffleChart spec={s} derived={derive(s)} />);
    expect(container.querySelector("[data-cells]")?.getAttribute("aria-hidden")).toBe("true");
  });
});

/**
 * El bullet compara cada punto con SU propia referencia, no con los otros
 * puntos. Por eso una sola fila ya es un bullet completo — a diferencia de las
 * barras o el lollipop, donde un punto solo no compara nada.
 */
function marca(over: Partial<PanelSpec> = {}): PanelSpec {
  return {
    id: "racha",
    title: "Rachas",
    context: { period: "Ahora mismo" },
    viz: "bullet",
    unit: UNITS.days,
    data: [{ key: "actual", label: "Racha actual", value: 5, target: 27 }],
    ...over,
  };
}

describe("bullet", () => {
  it("dice el valor y la marca, y las dos en el nombre accesible", () => {
    const s = marca();
    render(<BulletChart spec={s} derived={derive(s)} interactive />);
    expect(screen.getByLabelText("Racha actual: 5 días, tu marca 27 días")).toBeTruthy();
    expect(screen.getByText("5 / 27")).toBeTruthy();
  });

  it("sin marca de referencia no dibuja ninguna: inventarla diria que bátiste algo que nadie fijó", () => {
    const s = marca({ data: [{ key: "a", label: "A", value: 4 }] });
    const { container } = render(<BulletChart spec={s} derived={derive(s)} />);
    expect(container.querySelector("[data-target]")).toBeNull();
  });

  it("batir la marca se dice con palabra, no solo con color", () => {
    const s = marca({ data: [{ key: "a", label: "A", value: 30, target: 27 }] });
    render(<BulletChart spec={s} derived={derive(s)} interactive />);
    expect(screen.getByLabelText(/marca batida/i)).toBeTruthy();
  });

  it("la escala es común a todas las filas, o comparar entre filas sería falso", () => {
    const s = marca({
      data: [
        { key: "a", label: "A", value: 10, target: 20 },
        { key: "b", label: "B", value: 20, target: 20 },
      ],
    });
    const { container } = render(<BulletChart spec={s} derived={derive(s)} />);
    const barras = [...container.querySelectorAll("[data-fill]")] as HTMLElement[];
    // 10 y 20 sobre el mismo techo: la primera mide la mitad que la segunda.
    expect(barras[0].style.width).toBe("50%");
    expect(barras[1].style.width).toBe("100%");
  });

  it("un hueco no pinta barra: `null` no es cero", () => {
    const s = marca({ data: [{ key: "a", label: "A", value: null, target: 20 }] });
    const { container } = render(<BulletChart spec={s} derived={derive(s)} />);
    expect(container.querySelector("[data-fill]")).toBeNull();
    expect(screen.getByText(/Sin datos/)).toBeTruthy();
  });
});

describe("dumbbell", () => {
  it("dice de dónde a dónde, y en qué dirección", () => {
    const s = spec({
      viz: "dumbbell",
      unit: UNITS.stars,
      data: [{ key: "dune", label: "Dune", from: 3.5, value: 5 }],
    });
    render(<DumbbellChart spec={s} derived={derive(s)} interactive />);
    const marca = screen.getByLabelText(/^Dune: de 3,5 ★ a 5,0 ★, sube 1,5 ★$/);
    expect(marca.getAttribute("tabindex")).toBe("0");
  });

  it("bajar y subir no se distinguen solo por el color", () => {
    const s = spec({
      viz: "dumbbell",
      unit: UNITS.stars,
      data: [{ key: "a", label: "A", from: 4.5, value: 3.5 }],
    });
    render(<DumbbellChart spec={s} derived={derive(s)} interactive />);
    // La PALABRA «baja» está en el nombre accesible: el color es redundante.
    expect(screen.getByLabelText(/baja 1,0 ★/)).toBeTruthy();
  });

  it("sin cambio lo dice, en vez de fingir una dirección", () => {
    const s = spec({
      viz: "dumbbell",
      unit: UNITS.stars,
      data: [{ key: "a", label: "A", from: 4, value: 4 }],
    });
    render(<DumbbellChart spec={s} derived={derive(s)} interactive />);
    expect(screen.getByLabelText(/no cambia/)).toBeTruthy();
  });

  it("una fila sin punto de partida no es un dumbbell y no entra en el foco", () => {
    // `from` ausente = no hay de dónde. Dibujar el punto de llegada solo diría
    // «esta obra vale 4», que es otro panel.
    const s = spec({
      viz: "dumbbell",
      unit: UNITS.stars,
      data: [{ key: "a", label: "A", value: 4 }],
    });
    render(<DumbbellChart spec={s} derived={derive(s)} interactive />);
    expect(screen.queryByLabelText(/^A:/)).toBeNull();
  });

  it("escribe las dos cifras: es lo que le permite perder la tabla", () => {
    const s = spec({
      viz: "dumbbell",
      unit: UNITS.stars,
      data: [{ key: "dune", label: "Dune", from: 3.5, value: 5 }],
    });
    render(<DumbbellChart spec={s} derived={derive(s)} interactive />);
    expect(screen.getByText("3,5 → 5,0 ★")).toBeTruthy();
  });
});
