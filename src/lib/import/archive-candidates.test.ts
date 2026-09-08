import { afterEach, expect, it, vi } from "vitest";
import { prepareArchiveCandidates } from "./archive-candidates";
import type { ImportCandidate } from "./types";

const candidate: ImportCandidate = { itemType: "movie", externalId: "12", title: "Echo", year: 2020,
  coverUrl: null, synopsis: null, genres: null, subtitle: null };
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("keeps distinct homonyms and the original choice index while merging repeated identities", async () => {
  vi.stubEnv("TMDB_API_KEY", "synthetic");
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => new Response(JSON.stringify({
    runtime: 94, credits: { crew: [{ job: "Director", name: "Ada Example" }] },
  }))));
  const choices = await prepareArchiveCandidates([candidate, { ...candidate, catalogId: "local" },
    { ...candidate, externalId: "13" }]);
  expect(choices.map(c => [c.index, c.candidate.externalId, c.director, c.runtimeMinutes])).toEqual([
    [0, "12", "Ada Example", 94], [2, "13", "Ada Example", 94],
  ]);
});

it("distinguishes a failed details request from legitimately unavailable metadata", async () => {
  vi.stubEnv("TMDB_API_KEY", "synthetic");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response("", { status: 503 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ credits: { crew: [] }, runtime: 0 }))));
  const choices = await prepareArchiveCandidates([candidate, { ...candidate, externalId: "13" }]);
  expect(choices.map(c => [c.detailsState, c.director, c.runtimeMinutes])).toEqual([
    ["failed", null, null], ["available", null, null],
  ]);
});
