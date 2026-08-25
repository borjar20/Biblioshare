// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UNITS, type PanelSpec } from "@/lib/stats/panel/types";
import { StatPanel } from "./stat-panel";

// `PanelDialog` es cliente y llama a `usePathname()` para cerrarse al navegar.
// Fuera del App Router ese hook no tiene contexto y revienta; aquí no se está
// probando la navegación, así que se le da una ruta fija.
vi.mock("next/navigation", () => ({ usePathname: () => "/estadisticas" }));

// Sin `globals: true` en `vitest.config.ts`, la limpieza automática de
// testing-library no se registra y cada `render` se acumula en el mismo body:
// una aserción de «no aparece» pasaría a ver los restos del test anterior.
afterEach(cleanup);

describe("nadie lee spec.viz", () => {
  it("stat-panel enruta TODO por derived.viz", () => {
    const src = readFileSync("src/components/stats/panel/stat-panel.tsx", "utf8");
    // Guardia de texto a propósito: el typecheck NO caza esto, porque
    // `spec.viz` y `derived.viz` son el mismo tipo. Es el único invariante del
    // sistema que solo se puede afirmar leyendo el fichero.
    expect(src).not.toMatch(/spec\.viz/);
  });
});

describe("panel degradado", () => {
  const dosPuntos: PanelSpec = {
    id: "pila",
    title: "Evolución de la pila",
    context: { period: "Todo" },
    viz: "line",
    unit: UNITS.works,
    data: [
      { key: "jul", label: "Julio", value: 26 },
      { key: "ago", label: "Agosto", value: 31 },
    ],
  };

  it("con dos puntos no dibuja la línea, pero conserva la cifra", () => {
    render(<StatPanel spec={dosPuntos} />);
    // El título sale DOS veces: la capa repite la cabecera de la cara a propósito.
    expect(screen.getAllByText("Evolución de la pila")).toHaveLength(2);
    expect(screen.queryByRole("img", { name: /Julio/ })).toBeNull();
    // La cifra sigue en el DOM: la tarjeta degradada no se queda hueca.
    expect(screen.getAllByText("57 obras").length).toBeGreaterThan(0);
  });

  it("un panel degradado lo dice, para que nadie crea que el gráfico se perdió", () => {
    render(<StatPanel spec={dosPuntos} />);
    expect(screen.getAllByText(/todavía no hay curva/i).length).toBeGreaterThan(0);
  });

  it("el degradado CONSERVA la tabla: es lo único que queda con los valores exactos", () => {
    render(<StatPanel spec={dosPuntos} />);
    // Sin esto, los dos puntos desaparecerían del DOM: sin gráfico, sin tabla y
    // con un único KPI fabricado que solo dice el total.
    expect(screen.getByText("Julio")).toBeTruthy();
    expect(screen.getByText("Agosto")).toBeTruthy();
  });

  it("con cuatro puntos no degrada y el gráfico se dibuja", () => {
    render(
      <StatPanel
        spec={{
          ...dosPuntos,
          data: [
            ...dosPuntos.data,
            { key: "sep", label: "Septiembre", value: 18 },
            { key: "oct", label: "Octubre", value: 22 },
          ],
        }}
      />,
    );
    expect(screen.queryAllByText(/todavía no hay curva/i)).toHaveLength(0);
  });
});

describe("nivel 2 — vacío por filtro", () => {
  const vacio: PanelSpec = {
    id: "horas-por-mes",
    title: "Horas por mes",
    context: { period: "Esta semana" },
    viz: "area",
    unit: UNITS.minutes,
    data: [],
    empty: {
      title: "Sin sesiones esta semana",
      elsewhere: {
        text: "En 2026 llevas 148 h",
        href: "/estadisticas",
        label: "Ver todo el año",
      },
    },
  };

  it("dice la cifra que sí existe fuera del filtro y ofrece la salida", () => {
    render(<StatPanel spec={vacio} />);
    expect(screen.getByText("En 2026 llevas 148 h")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Ver todo el año/ })).toBeTruthy();
  });

  it("sin cifra de fuera NO hay enlace: llevar a otro sitio vacío es peor que no ofrecer salida", () => {
    render(<StatPanel spec={{ ...vacio, empty: { title: "Sin sesiones esta semana" } }} />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("Sin sesiones esta semana")).toBeTruthy();
  });
});
