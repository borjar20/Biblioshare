import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RatingDots } from "./rating-dots";

// Regresión de la ficha: en «Comunidad» salían DIEZ dots en móvil. El resumen
// pinta dos instancias — `lg:hidden` (sm) y `hidden lg:flex` (md) — y esperaba
// que `className` pudiera apagar cada una en su ancho. No podía: la className
// aterrizaba en el mismo div que ya llevaba `inline-flex`, y Tailwind emite
// `.inline-flex` DESPUÉS de `.hidden`, así que `hidden` nunca ganaba y la
// instancia de PC se veía también en móvil.
//
// Lo que fija el test es el contrato: `className` va en el elemento MÁS
// EXTERNO, y ese elemento no trae una utilidad de display propia con la que
// pelearse.
describe("RatingDots", () => {
  const outerTag = (html: string) => html.slice(0, html.indexOf(">") + 1);

  it("pone className en el elemento más externo", () => {
    const html = renderToStaticMarkup(
      createElement(RatingDots, { value: 7, className: "hidden lg:flex" }),
    );
    expect(outerTag(html)).toContain("hidden lg:flex");
  });

  it("no mezcla className con la utilidad de display propia", () => {
    const html = renderToStaticMarkup(
      createElement(RatingDots, { value: 7, className: "hidden lg:flex" }),
    );
    // Si `hidden` comparte elemento con `inline-flex`, el display del
    // consumidor pierde y el componente no se puede ocultar desde fuera.
    expect(outerTag(html)).not.toContain("inline-flex");
  });

  it("sigue pintando cinco dots", () => {
    const html = renderToStaticMarkup(createElement(RatingDots, { value: 7 }));
    expect(html.match(/rounded-full/g)).toHaveLength(5);
  });
});
