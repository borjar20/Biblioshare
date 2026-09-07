import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchAuthorWorks } from "./author-books";
import { fetchWorkIdentityEvidence } from "./work-identity";
import { normalizeAuthorWorks } from "./normalize";
import captured from "./__fixtures__/work-identity-2026-09-07.json";
import collinsEs from "./__fixtures__/collins-es.json";
import collinsEn from "./__fixtures__/collins-en.json";
import shustermanEs from "./__fixtures__/shusterman-es.json";
import shustermanEn from "./__fixtures__/shusterman-en.json";

afterEach(() => vi.unstubAllGlobals());
const doc = (key: string, title: string, editionTitle = title) => ({
  key, title, language: ["eng"], edition_count: 2,
  editions: { docs: [{ title: editionTitle, language: ["eng"] }] },
});
function provider(docs: ReturnType<typeof doc>[], details: Record<string, unknown> = {}) {
  const fetch = vi.fn(async (input: unknown) => {
    const url = new URL(String(input));
    if (url.pathname === "/search.json") return { ok: true, json: async () => ({ docs }) };
    if (!(url.pathname in details)) throw new Error("timeout");
    return { ok: true, json: async () => details[url.pathname] };
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

describe("author bibliography identity", () => {
  it("resolves all four extra fixture records using captured provider evidence and corrects the real wrong title", async () => {
    provider([], captured.responses);
    const ce = await fetchWorkIdentityEvidence([...collinsEs.docs, ...collinsEn.docs]);
    const se = await fetchWorkIdentityEvidence([...shustermanEs.docs, ...shustermanEn.docs]);
    const collins = normalizeAuthorWorks(collinsEs.docs, collinsEn.docs, ce);
    const shusterman = normalizeAuthorWorks(shustermanEs.docs, shustermanEn.docs, se);
    expect(collins).toHaveLength(14);
    expect(shusterman).toHaveLength(68);
    expect(collins.map((w) => w.title)).toContain("Amanecer de la Cosecha");
    expect(collins.some((w) => w.workKey === "/works/OL24268078W")).toBe(false);
    expect(shusterman.find((w) => w.workKey === "/works/OL15420142W")?.title).toBe("It's O.K. to say no to cigarettes and alcohol!");
    expect(shusterman.filter((w) => ["Everlost", "Everwild", "Everfound"].includes(w.title))).toHaveLength(3);
    expect(shusterman.some((w) => ["/works/OL25399947W", "/works/OL25375929W"].includes(w.workKey))).toBe(false);
  });
  it("keeps Everlost and Everwild with their own titles despite a bad edition", async () => {
    provider([doc("/works/OL1W", "Everlost", "Everwild"), doc("/works/OL2W", "Everwild")]);
    expect((await fetchAuthorWorks("OL1A")).map((w) => [w.workKey, w.title])).toEqual([
      ["/works/OL1W", "Everlost"], ["/works/OL2W", "Everwild"],
    ]);
  });
  it("uses a provider redirect to merge translated works without an edition-title bridge", async () => {
    provider([doc("/works/OL1W", "Amanecer", "Sunrise"), doc("/works/OL2W", "Sunrise")], {
      "/works/OL1W.json": { key: "/works/OL1W", type: { key: "/type/work" } },
      "/works/OL2W.json": { key: "/works/OL2W", type: { key: "/type/redirect" }, location: "/works/OL1W" },
    });
    const works = await fetchAuthorWorks("OL1A");
    expect(works).toHaveLength(1);
    expect(works[0].workKey).toBe("/works/OL1W");
  });
  it("does not discard a novel just because one edition is a box set", async () => {
    provider([doc("/works/OL1W", "Everlost", "Everlost 5 Books Box Set")], {
      "/works/OL1W.json": { key: "/works/OL1W", type: { key: "/type/work" } },
      "/works/OL1W/editions.json": { size: 2, entries: [
        { key: "/books/OL1M", title: "Everlost Box Set", works: [{ key: "/works/OL1W" }] },
        { key: "/books/OL2M", title: "Everlost", works: [{ key: "/works/OL1W" }] },
      ] },
    });
    expect((await fetchAuthorWorks("OL1A")).map((w) => w.title)).toEqual(["Everlost"]);
  });
  it("filters a collection corroborated by all distinct editions of a complete response", async () => {
    provider([doc("/works/OL1W", "Ultimate Unwind", "Unwind Box Set")], {
      "/works/OL1W.json": { key: "/works/OL1W", type: { key: "/type/work" } },
      "/works/OL1W/editions.json": { size: 2, entries: [
        { key: "/books/OL1M", title: "Unwind Box Set", works: [{ key: "/works/OL1W" }] },
        { key: "/books/OL2M", title: "Ultimate Unwind Collection", subtitle: "Unwind; Unwholly; Unsouled", works: [{ key: "/works/OL1W" }] },
      ] },
    });
    expect(await fetchAuthorWorks("OL1A")).toEqual([]);
  });
  it.each(["partial", "duplicate", "unlinked"])("keeps a work with %s edition evidence", async (kind) => {
    const entry = { key: "/books/OL1M", title: "Unwind Box Set", works: [{ key: "/works/OL1W" }] };
    provider([doc("/works/OL1W", "Ultimate Unwind", "Unwind Box Set")], {
      "/works/OL1W.json": { key: "/works/OL1W", type: { key: "/type/work" } },
      "/works/OL1W/editions.json": { size: kind === "partial" ? 3 : 2, entries: [entry,
        { ...entry, key: kind === "duplicate" ? entry.key : "/books/OL2M", works: kind === "unlinked" ? [] : entry.works },
      ] },
    });
    expect(await fetchAuthorWorks("OL1A")).toHaveLength(1);
  });
  it("does not follow provider redirects outside work identifiers", async () => {
    const fetch = provider([doc("/works/OL1W", "A", "B"), doc("/works/OL2W", "B")], {
      "/works/OL1W.json": { type: { key: "/type/redirect" }, location: "https://example.com" },
    });
    expect(await fetchAuthorWorks("OL1A")).toHaveLength(2);
    expect(fetch.mock.calls.every(([url]) => String(url).startsWith("https://openlibrary.org/"))).toBe(true);
  });
});
