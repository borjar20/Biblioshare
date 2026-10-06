// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it } from "vitest";
import messages from "../../../messages/es.json";
import { posterFor, type PosterModel } from "@/lib/wrap-ups/view-models";
import type { Story } from "@/lib/wrap-ups/types";
import { samplePayload } from "./__fixtures__/sample-payload";
import { Poster } from "./poster";

afterEach(cleanup);

const payload = samplePayload();
const t = createTranslator({ locale: "es", messages }) as never;
const modelOf = (id: Story["id"]): PosterModel => posterFor(payload.stories.find((s) => s.id === id)!, payload, t);

function renderPoster(model: PosterModel, showPet = false) {
  return render(
    <NextIntlClientProvider locale="es" messages={messages}>
      <Poster model={model} palette="book" narrator="reader" pet={payload.pet} showPet={showPet} />
    </NextIntlClientProvider>,
  );
}

describe("Poster", () => {
  it("figure: la cifra y su unidad son el h2, un <p> por línea y la narradora en texto", () => {
    const m = modelOf("time");
    const { container } = renderPoster(m);
    const h2 = screen.getByRole("heading", { level: 2 });
    expect(h2.textContent).toBe(`${m.figure!.value} ${m.figure!.unit}`);
    for (const l of m.lines) expect(screen.getByText(l).tagName).toBe("P");
    expect(screen.getByText(m.narratorLine).tagName).toBe("P");
    // La narradora es decoración: fuera del árbol accesible.
    expect(container.querySelector("[data-variant='reader']")!.closest("[aria-hidden='true']")).not.toBeNull();
    expect(container.querySelector("article")!.getAttribute("style")).toContain("var(--type-book)");
  });

  it("hero: el título es el h2 y la ardilla propia sale solo con showPet", () => {
    const m = modelOf("cover");
    renderPoster(m);
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(m.lines[0]);
    expect(screen.getByText(m.eyebrow)).toBeTruthy();
    expect(screen.queryByRole("img", { name: "Bellota" })).toBeNull();
    cleanup();
    renderPoster(m, true);
    expect(screen.getByRole("img", { name: "Bellota" })).toBeTruthy();
  });

  it("covers: cada portada es una carta; sin coverUrl, carta con el título", () => {
    const m = modelOf("finished");
    renderPoster(m);
    const list = screen.getByRole("list");
    expect(within(list).getAllByRole("listitem")).toHaveLength(4);
    expect(within(list).getByText("Piranesi")).toBeTruthy();
  });

  it("strip: una celda por día con su estado legible", () => {
    renderPoster(modelOf("rhythm"));
    const cells = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(cells).toHaveLength(7);
    expect(cells[0].textContent).toContain("con actividad");
    expect(cells[2].textContent).toContain("sin actividad");
  });

  it("months: las cifras de cada mes son visibles, no sólo para lectores de pantalla", () => {
    const m = modelOf("months");
    renderPoster(m);
    const cells = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(cells).toHaveLength(12);
    for (let i = 0; i < cells.length; i++) {
      const value = within(cells[i]).getByText(m.strip![i].value);
      expect(value.classList.contains("sr-only")).toBe(false);
      expect(value.getAttribute("aria-hidden")).not.toBe("true");
    }
  });

  it("finished: el contador adicional incluye las obras que no caben en las cuatro cartas", () => {
    const items = Array.from({ length: 6 }, (_, i) => ({ type: "book" as const, id: String(i), title: "Libro " + i, coverUrl: null, times: 1 }));
    const m = posterFor({ id: "finished", items, total: 6 }, payload, t);
    renderPoster(m);
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
    expect(m.lines.join(" ")).toContain("2");
  });

  it("ranking: lista ordenada con etiqueta y valor; sin cifra, el rótulo es el h2", () => {
    const m = modelOf("genres");
    renderPoster(m);
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(m.eyebrow);
    const items = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0].textContent).toContain("Ciencia ficción");
  });

  it("quote: la cita va en blockquote con su atribución", () => {
    const m = modelOf("best_rated");
    const { container } = renderPoster(m);
    expect(container.querySelector("blockquote")!.textContent).toContain(m.quote!.body);
    expect(screen.getByRole("heading", { level: 2 }).textContent).toContain("/5");
  });

  it("closing: cifra, portadas y líneas", () => {
    const m = modelOf("closing");
    renderPoster(m, true);
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(`${m.figure!.value} ${m.figure!.unit}`);
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
    for (const l of m.lines) expect(screen.getByText(l)).toBeTruthy();
  });

  it("pinta todas las stories del ejemplo sin romperse", () => {
    for (const s of payload.stories) {
      renderPoster(posterFor(s, payload, t));
      expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(1);
      cleanup();
    }
  });
});
