import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenLibrarySearchDoc } from "./openlibrary/search-normalize";

// Only the database boundary is replaced. The local search, public entrypoint,
// both HTTP clients, normalizer, merge and QID collapse all execute real code.
const database = vi.hoisted(() => {
  const limit = vi.fn(async () => ({ data: [] }));
  const ilike = vi.fn(() => ({ limit }));
  const select = vi.fn(() => ({ ilike }));
  const from = vi.fn(() => ({ select }));
  return { limit, ilike, select, from };
});
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: database.from }),
}));

import { searchCatalog } from "./search";
import { searchWorks } from "./openlibrary/work-search";
import { normalizeSearchWorks } from "./openlibrary/search-normalize";
import { searchInventaireEntities } from "./inventaire/client";
import { collapseByWikidata } from "./wikidata-collapse";

type Capture = {
  file: string;
  url: string;
  capturedAt: string;
  status: number;
  contentType: string;
  bytes: number;
  sha256: string;
};
type FixtureName = "palabras-radiantes" | "the-stranger" | "hunger-games";
type Fixture = {
  directory: URL;
  query: string;
  records: Capture[];
};
type SearchResponse = { docs: OpenLibrarySearchDoc[] };
type EntityResponse = {
  entities: Record<string, {
    labels: Record<string, string>;
    claims?: Record<string, unknown[]>;
  }>;
};

function loadFixture(name: FixtureName): Fixture {
  const directory = new URL(`./__fixtures__/qid-collapse-2026-10-03/${name}/`, import.meta.url);
  const manifest = JSON.parse(readFileSync(new URL("manifest.json", directory), "utf8"));
  return { directory, ...manifest };
}

function readJson<T>(fixture: Fixture, file: string): T {
  return JSON.parse(readFileSync(new URL(file, fixture.directory), "utf8")) as T;
}

const fixtures = {
  "palabras-radiantes": loadFixture("palabras-radiantes"),
  "the-stranger": loadFixture("the-stranger"),
  "hunger-games": loadFixture("hunger-games"),
};

function replay(fixture: Fixture, omitFile?: string) {
  const captures = new Map(fixture.records
    .filter((record) => record.file !== omitFile)
    .map((record) => [record.url, record]));
  const requests: string[] = [];
  const unrecorded: string[] = [];

  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    requests.push(url);
    const capture = captures.get(url);
    if (!capture) {
      unrecorded.push(url);
      throw new Error(`Unrecorded fixture URL: ${url}`);
    }
    const body = readFileSync(new URL(capture.file, fixture.directory));
    expect(body.length, capture.file).toBe(capture.bytes);
    expect(createHash("sha256").update(body).digest("hex"), capture.file).toBe(capture.sha256);
    return new Response(new Uint8Array(body), {
      status: capture.status,
      headers: { "content-type": capture.contentType },
    });
  }));

  return {
    assertComplete() {
      // The production clients deliberately swallow HTTP failures. A throw in
      // fetch alone would silently turn a missing fixture into a partial PASS.
      if (unrecorded.length) throw new Error(`Unrecorded fixture URL: ${unrecorded.join(", ")}`);
      const expected = fixture.records
        .filter((record) => !record.file.startsWith("work-"))
        .map((record) => record.url);
      expect([...requests].sort()).toEqual(expected.sort());
    },
  };
}

async function searchFixture(fixture: Fixture, omitFile?: string) {
  const recorder = replay(fixture, omitFile);
  const results = await searchCatalog("book", fixture.query);
  recorder.assertComplete();
  expect(database.from).toHaveBeenCalledExactlyOnceWith("books");
  expect(database.ilike).toHaveBeenCalledExactlyOnceWith("title", `%${fixture.query}%`);
  expect(database.limit).toHaveBeenCalledExactlyOnceWith(20);
  return results;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("MOCK_EXTERNAL_APIS", "false");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("searchCatalog — recorded OpenLibrary + Inventaire responses (#916)", () => {
  it("preserves all 17 complete HTTP responses, with capture origin and SHA-256", () => {
    const captures = Object.values(fixtures).flatMap((fixture) => {
      expect(new Set(fixture.records.map((record) => record.url)).size).toBe(fixture.records.length);
      return fixture.records.map((record) => {
        expect(record.status).toBe(200);
        expect(record.capturedAt).toMatch(/^2026-10-03T/);
        expect(["openlibrary.org", "inventaire.io"]).toContain(new URL(record.url).hostname);
        const body = readFileSync(new URL(record.file, fixture.directory));
        expect(body.length, record.file).toBe(record.bytes);
        expect(createHash("sha256").update(body).digest("hex"), record.file).toBe(record.sha256);
        expect(() => JSON.parse(body.toString("utf8"))).not.toThrow();
        return record;
      });
    });
    expect(captures).toHaveLength(17);
  });

  it("collapses the two real Radiance works through public search and resolved author labels", async () => {
    const fixture = fixtures["palabras-radiantes"];
    const es = readJson<SearchResponse>(fixture, "openlibrary-search-es.json");
    const en = readJson<SearchResponse>(fixture, "openlibrary-search-en.json");
    expect(es.docs.map(({ key, title, edition_count }) => ({ key, title, edition_count }))).toEqual([
      { key: "/works/OL16813053W", title: "Words of Radiance", edition_count: 23 },
      { key: "/works/OL38056408W", title: "Palabras Radiantes", edition_count: 1 },
    ]);
    // Different canonical titles survive OL's title+author deduplication.
    expect(normalizeSearchWorks(es.docs, en.docs).map((result) => result.externalId)).toEqual([
      "/works/OL16813053W", "/works/OL38056408W",
    ]);
    const works = readJson<EntityResponse>(fixture, "inventaire-works.json");
    const authors = readJson<EntityResponse>(fixture, "inventaire-authors.json");
    expect(works.entities["wd:Q8034469"].labels).toMatchObject({
      en: "Words of Radiance", es: "Palabras radiantes",
    });
    expect(works.entities["wd:Q8034469"].claims?.["wdt:P50"]).toContain("wd:Q457608");
    expect(authors.entities["wd:Q457608"].labels.en).toBe("Brandon Sanderson");

    const results = await searchFixture(fixture);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      externalId: "/works/OL16813053W", wikidataId: "Q8034469", subtitle: "Brandon Sanderson",
    });
    expect(results[0].catalogId).toBeUndefined();
    expect(results[0].altTitles).toEqual(expect.arrayContaining(["Words of Radiance", "Palabras Radiantes"]));
  });

  it("retains the first real candidate when relevance is reversed, even with only one edition", async () => {
    const fixture = fixtures["palabras-radiantes"];
    const recorder = replay(fixture);
    const [candidates, entities] = await Promise.all([
      searchWorks(fixture.query), searchInventaireEntities(fixture.query),
    ]);
    recorder.assertComplete();
    expect(entities.find((entity) => entity.uri === "wd:Q8034469")).toMatchObject({
      authorNames: ["Brandon Sanderson"],
    });
    expect(candidates.map((result) => result.externalId)).toEqual([
      "/works/OL16813053W", "/works/OL38056408W",
    ]);
    const results = collapseByWikidata([...candidates].reverse(), entities);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ externalId: "/works/OL38056408W", wikidataId: "Q8034469" });
  });

  it("keeps same-title Stranger books with different authors and QIDs separate", async () => {
    const fixture = fixtures["the-stranger"];
    const { docs } = readJson<SearchResponse>(fixture, "openlibrary-search-es.json");
    const keys = ["/works/OL17358805W", "/works/OL3743755W"];
    expect(keys.map((key) => docs.find((doc) => doc.key === key)?.title)).toEqual([
      "The Stranger", "The Stranger",
    ]);

    const results = await searchFixture(fixture);
    expect(results.find((result) => result.externalId === keys[0])).toMatchObject({
      subtitle: "Harlan Coben", wikidataId: "Q107296246",
    });
    expect(results.find((result) => result.externalId === keys[1])).toMatchObject({
      subtitle: "Chris Van Allsburg", wikidataId: "Q7766935",
    });
  });

  it("rejects shared Hunger Games edition titles so sibling works keep their own QIDs", async () => {
    const fixture = fixtures["hunger-games"];
    const { docs } = readJson<SearchResponse>(fixture, "openlibrary-search-en.json");
    for (const key of ["/works/OL14908941W", "/works/OL5735360W"]) {
      expect(docs.find((doc) => doc.key === key)?.editions?.docs?.[0].title).toBe("The Hunger Games");
    }

    const results = await searchFixture(fixture);
    expect(results.find((result) => result.externalId === "/works/OL5735363W")).toMatchObject({
      title: "The Hunger Games", subtitle: "Suzanne Collins", wikidataId: "Q11678",
    });
    expect(results.find((result) => result.externalId === "/works/OL14908941W")).toMatchObject({
      title: "Mockingjay", subtitle: "Suzanne Collins", wikidataId: "Q40354", altTitles: ["Mockingjay"],
    });
    expect(results.find((result) => result.externalId === "/works/OL5735360W")).toMatchObject({
      title: "Catching Fire", subtitle: "Suzanne Collins", wikidataId: "Q837140", altTitles: ["Catching Fire"],
    });
  });

  it("reports a missing exact URL even when the production client catches its fetch rejection", async () => {
    const fixture = fixtures["palabras-radiantes"];
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(searchFixture(fixture, "inventaire-authors.json")).rejects.toThrow("Unrecorded fixture URL:");
    expect(warning).toHaveBeenCalledWith("Inventaire lookup incomplete", { reason: "Error" });
  });
});
