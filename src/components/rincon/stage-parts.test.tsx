// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/es.json";
import { DEFAULT_SETTINGS, type SorteoItem } from "./sorteo-logic";
import { StageBookcase } from "./stage-bookcase";
import { StageTune } from "./stage-tune";
import { StagePodium } from "./stage-podium";

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
});

describe("StagePodium", () => {
  it("en descarte cada candidato tiene su ✕ con nombre accesible", () => {
    const onDiscard = vi.fn();
    render(wrap(<StagePodium phase="discard" candidates={[mk("a"), mk("b"), mk("c")]} presented={3}
      focusIndex={null} duelPick={null} winner={null} onDiscard={onDiscard} onPick={() => {}} />));
    fireEvent.click(screen.getByRole("button", { name: "Devolver Libro b a la balda" }));
    expect(onDiscard).toHaveBeenCalledWith(1);
  });
});
