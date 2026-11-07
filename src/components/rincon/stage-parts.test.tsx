// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/es.json";
import { DEFAULT_SETTINGS, type SorteoItem } from "./sorteo-logic";
import { StageBookcase } from "./stage-bookcase";
import { StageTune } from "./stage-tune";
import { StagePodium } from "./stage-podium";
import { StagePet } from "./stage-pet";
import { PET_CLASSES } from "@/lib/pet/classes";

vi.mock("@/components/pet/pet-sprite", () => ({ PetSprite: () => <span data-testid="sprite" /> }));

const mk = (id: string, over: Partial<SorteoItem> = {}): SorteoItem => ({
  itemType: "book", itemId: id, title: `Libro ${id}`, subtitle: "Ana Pérez", coverUrl: null, metaText: "",
  estimatedMinutes: 100, estimateText: null, fresh: true, collectionIds: [],
  plannedSince: "2026-01-01T00:00:00Z", totalEpisodes: null, ...over,
});
const wrap = (ui: React.ReactNode) => (
  <NextIntlClientProvider locale="es" messages={messages}>{ui}</NextIntlClientProvider>
);
afterEach(cleanup);

describe("StageBookcase", () => {
  it("pinta un lomo por ítem con su título y apaga los no elegibles", () => {
    const items = [mk("a"), mk("b")];
    render(wrap(<StageBookcase items={items} offKeys={new Set(["book:b"])} tickKey={null}
      pulledKeys={new Set()} takenKeys={new Set()} lit={false} dim={false} shakeSeq={0} choosing>{null}</StageBookcase>));
    expect(screen.getByTitle("Libro a").className).not.toMatch(/off/);
    expect(screen.getByTitle("Libro b").className).toMatch(/off/);
  });
  it("el temblor lo pone React al cambiar shakeSeq y se quita al acabar la animación", () => {
    const items = [mk("a")];
    const at = (shakeSeq: number, lit = false) => wrap(<StageBookcase items={items} offKeys={new Set()} tickKey={null}
      pulledKeys={new Set()} takenKeys={new Set()} lit={lit} dim={false} shakeSeq={shakeSeq} choosing={false}>{null}</StageBookcase>);
    const { container, rerender } = render(at(0));
    const box = () => container.querySelector<HTMLElement>("[class*='case']")!;
    expect(box().className).not.toMatch(/shake/);
    rerender(at(1));
    expect(box().className).toMatch(/shake/);
    rerender(at(1, true)); // otro render (el foco se enciende) no lo corta
    expect(box().className).toMatch(/shake/);
    // jsdom no trae AnimationEvent y React escucha entonces el nombre con prefijo.
    fireEvent(box(), new Event("webkitAnimationEnd", { bubbles: true }));
    fireEvent.animationEnd(box());
    expect(box().className).not.toMatch(/shake/);
    rerender(at(2));
    expect(box().className).toMatch(/shake/);
  });
});

describe("StagePet", () => {
  it("el bocadillo (role=status) es el mismo nodo con narrador y con mascota", () => {
    const speech = { text: "Hola", mood: "idle" } as const;
    const { rerender } = render(<StagePet pet={null} speech={speech} entered={false} />);
    const before = screen.getByRole("status");
    expect(before.className).toMatch(/narrated/);
    rerender(<StagePet pet={{ name: "Bellota", petClass: PET_CLASSES[0], stage: "young" }} speech={speech} entered />);
    const after = screen.getByRole("status");
    expect(after).toBe(before);
    expect(after.className).not.toMatch(/narrated/);
    expect(screen.getByTestId("sprite")).toBeTruthy();
  });
  it("la bellota también sale (no cae al narrador); sin mascota, narrador", () => {
    const speech = { text: "Hola", mood: "idle" } as const;
    const { rerender } = render(<StagePet pet={{ name: "Nuez", petClass: PET_CLASSES[0], stage: "acorn" }} speech={speech} entered />);
    expect(screen.getByTestId("sprite")).toBeTruthy();
    expect(screen.getByRole("status").className).not.toMatch(/narrated/);
    rerender(<StagePet pet={null} speech={speech} entered />);
    expect(screen.queryByTestId("sprite")).toBeNull();
    expect(screen.getByRole("status").className).toMatch(/narrated/);
  });
});

describe("StageTune", () => {
  it("cambiar a Películas ofrece «Para esta noche» y avisa del cambio", () => {
    const onChange = vi.fn();
    render(wrap(<StageTune open pool={[mk("m", { itemType: "movie" })]} collections={[]}
      settings={DEFAULT_SETTINGS} onChange={onChange} onDone={() => {}} />));
    fireEvent.click(screen.getByRole("button", { name: /Películas/ }));
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_SETTINGS, type: "movie" });
  });
  it("un antojo sin candidatos sale desactivado con «Nada aquí ahora»", () => {
    render(wrap(<StageTune open pool={[mk("a", { fresh: false })]} collections={[]}
      settings={DEFAULT_SETTINGS} onChange={() => {}} onDone={() => {}} />));
    const fresh = screen.getByRole("button", { name: /Nunca empezado/ });
    expect(fresh).toHaveProperty("disabled", true);
    expect(fresh.textContent).toContain("Nada aquí ahora");
  });
  it("las colecciones salen como chapas en su fila, no como fichas de antojo", () => {
    const onChange = vi.fn();
    const { container } = render(wrap(<StageTune open pool={[mk("a", { collectionIds: ["c1"] })]}
      collections={[{ id: "c1", name: "Clásicos" }, { id: "c2", name: "Vacía" }]}
      settings={DEFAULT_SETTINGS} onChange={onChange} onDone={() => {}} />));
    expect(screen.getByText(messages.sorteo.tuneCollectionsLabel)).toBeTruthy();
    const chip = screen.getByRole("button", { name: /Clásicos/ });
    expect(chip.className).toMatch(/colchip/);
    expect(chip.className).not.toMatch(/antojo/);
    expect(screen.getByRole("button", { name: /Vacía/ })).toHaveProperty("disabled", true);
    expect(container.querySelectorAll("[class*='_antojo_']")).toHaveLength(3); // Sorpréndeme, espera, nunca
    fireEvent.click(chip);
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_SETTINGS, antojo: "col:c1" });
  });
});

describe("StagePodium", () => {
  it("en descarte cada candidato tiene su ✕ con nombre accesible", () => {
    const onDiscard = vi.fn();
    render(wrap(<StagePodium phase="discard" candidates={[mk("a"), mk("b"), mk("c")]} presented={3}
      focusIndex={null} duelPick={null} winner={null} onDiscard={onDiscard} onPick={() => {}} />));
    fireEvent.click(screen.getByRole("button", { name: "Devolver Libro b a la balda" }));
    expect(onDiscard).toHaveBeenCalledWith(1);
  });
  it("durante la presentación todas las cartas reservan su etiqueta: las no presentadas, oculta", () => {
    const { container } = render(wrap(<StagePodium phase="present" candidates={[mk("a"), mk("b"), mk("c")]} presented={1}
      focusIndex={0} duelPick={null} winner={null} onDiscard={() => {}} onPick={() => {}} />));
    const tags = [...container.querySelectorAll<HTMLElement>("[class*='_tag_']")];
    // Mismo número de etiquetas que de cartas: si la etiqueta apareciera al
    // presentarse, la carta cambiaría de alto y saltaría (están alineadas por abajo).
    expect(tags).toHaveLength(3);
    expect(tags.map((t) => t.style.visibility)).toEqual(["", "hidden", "hidden"]);
    expect(tags.map((t) => t.getAttribute("aria-hidden"))).toEqual(["false", "true", "true"]);
    // Ya presentada la primera, ninguna carta conserva la animación de caída
    // (si se reiniciara, la carta volvería a caer desde arriba al enfocarla).
    expect([...container.querySelectorAll("[class*='_cand_']")].some((c) => /_drop_/.test(c.className))).toBe(false);
  });
  it("antes de presentar la primera, las tres caen (clase de caída con retardo escalonado)", () => {
    const { container } = render(wrap(<StagePodium phase="present" candidates={[mk("a"), mk("b"), mk("c")]} presented={0}
      focusIndex={null} duelPick={null} winner={null} onDiscard={() => {}} onPick={() => {}} />));
    const cards = [...container.querySelectorAll<HTMLElement>("[class*='_cand_']")];
    expect(cards.every((c) => /_drop_/.test(c.className))).toBe(true);
    expect(cards.map((c) => c.style.animationDelay)).toEqual(["0ms", "120ms", "240ms"]);
  });
});
