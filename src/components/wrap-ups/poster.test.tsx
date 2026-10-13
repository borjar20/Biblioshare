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

function renderPoster(model: PosterModel, showPet = false, paused = false) {
  return render(
    <NextIntlClientProvider locale="es" messages={messages}>
      <Poster model={model} palette="book" narrator="reader" pet={payload.pet} showPet={showPet} paused={paused} />
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

  it("ritmo: el calendario se lee por su resumen y no por cada casilla", () => {
    const { container } = renderPoster(modelOf("rhythm"));
    const cal = screen.getByRole("img", { name: modelOf("rhythm").calendar!.summary });
    expect(cal).toBeTruthy();
    expect(cal.querySelectorAll("[data-active='true']")).toHaveLength(5);
    expect(container.querySelectorAll("[data-active] [aria-hidden]").length).toBe(0);
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

  it("finished: el contador adicional incluye las obras que no caben en la rejilla", () => {
    const items = Array.from({ length: 6 }, (_, i) => ({ type: "book" as const, id: String(i), title: "Libro " + i, coverUrl: null, times: 1 }));
    const m = posterFor({ id: "finished", items, total: 8 }, payload, t);
    const { container } = renderPoster(m);
    expect(container.querySelector("ul[data-grid='static']")).not.toBeNull();
    expect(screen.getAllByRole("listitem")).toHaveLength(6);
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

const ref = (id: string) => ({ type: "book" as const, id, title: `Libro ${id}`, coverUrl: null, times: 1 });
const month = { ...payload, kind: "month" as const, periodStart: "2026-09-01", periodEnd: "2026-09-30" };

describe("bloques v2", () => {
  it("Terminado con scroll: todos los títulos en la lista, copia decorativa oculta y pausa", () => {
    const items = Array.from({ length: 12 }, (_, i) => ref(String(i)));
    const m = posterFor({ id: "finished", items, total: 12 }, month, t);
    const { container } = renderPoster(m, false, true);
    const lists = container.querySelectorAll("ul[data-grid]");
    expect(lists[0].getAttribute("data-grid")).toBe("scroll");
    expect(within(lists[0] as HTMLElement).getAllByRole("listitem")).toHaveLength(12);
    // La segunda copia (bucle) no se lee.
    expect(lists[1].getAttribute("aria-hidden")).toBe("true");
    expect(container.querySelector("article")!.getAttribute("data-paused")).toBe("true");
  });

  it("En marcha: una fila por obra con barra y etiqueta de sin avances", () => {
    const m = posterFor({ id: "in_progress", openTotal: 2, touchedTotal: 1, items: [
      { ...ref("a"), percent: 40, touched: true }, { ...ref("b"), percent: null, touched: false },
    ] }, month, t);
    renderPoster(m);
    expect(screen.getByRole("progressbar", { name: /Libro a/ }).getAttribute("aria-valuenow")).toBe("40");
    expect(screen.getByText("Sin avances este mes")).toBeTruthy();
  });

  it("Ritmo: calendario y mapas con resumen accesible", () => {
    const days = Array.from({ length: 30 }, (_, i) => ({ date: `2026-09-${String(i + 1).padStart(2, "0")}`, active: i < 3 }));
    const m = posterFor({ id: "rhythm", days, activeDays: 3, bestStreak: 3, favoriteWeekday: 5, favoriteBandStartHour: 0,
      byWeekday: [0, 1, 0, 0, 0, 3, 0], byBand: [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1] }, month, t);
    renderPoster(m);
    expect(screen.getByRole("img", { name: "Días con actividad: 1, 2, 3" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "Más activo el sábado" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "Más activo de 00:00 a 02:00" })).toBeTruthy();
  });

  it("En compañía: título de la obra, compañeros y clubes", () => {
    const m = posterFor({ id: "together", jointViewings: 1, clubDays: 2,
      viewings: [{ item: ref("L"), watchedOn: "2026-09-10", companionIds: ["u2"] }],
      clubs: [{ clubId: "c", name: "Club de los jueves", days: 2 }] }, month, t,
      { u2: { userId: "u2", username: "ana", displayName: "Ana", avatarUrl: null } });
    renderPoster(m);
    // La carta decorativa repite el título (aria-hidden): el legible es el párrafo.
    expect(screen.getByText("Libro L", { selector: "p" })).toBeTruthy();
    expect(screen.getByText("con Ana")).toBeTruthy();
    expect(screen.getByText("Club de los jueves")).toBeTruthy();
    expect(screen.getByText("2 días")).toBeTruthy();
  });

  it("sin los espacios de nombres de las stories (home): las etiquetas llegan escritas en el modelo", () => {
    const wr = messages.wrapUps as unknown as { ui: unknown; stories: { cover: unknown } };
    const scoped = { wrapUps: { ui: wr.ui, stories: { cover: wr.stories.cover } } };
    const renderScoped = (m: PosterModel) => render(
      <NextIntlClientProvider locale="es" messages={scoped}>
        <Poster model={m} palette="book" narrator="reader" pet={payload.pet} showPet={false} />
      </NextIntlClientProvider>,
    );
    const inProgress = posterFor({ id: "in_progress", openTotal: 1, items: [{ ...ref("b"), percent: null, touched: false }] }, month, t);
    renderScoped(inProgress);
    expect(screen.getByText("Sin avances este mes")).toBeTruthy();
    cleanup();
    const together = posterFor({ id: "together", jointViewings: 1, clubDays: 0,
      viewings: [{ item: ref("L"), watchedOn: "2026-09-10", companionIds: ["u2"] }], clubs: [] }, month, t,
      { u2: { userId: "u2", username: "ana", displayName: "Ana", avatarUrl: null } });
    renderScoped(together);
    expect(screen.getByText("con Ana")).toBeTruthy();
  });
});
