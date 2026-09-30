/* Local-only provider fixture for #754. It composes after archive-tmdb.cjs. */
// eslint-disable-next-line @typescript-eslint/no-require-imports
require('./archive-tmdb.cjs');
const local = /^http:\/\/(127\.0\.0\.1|localhost):54321$/;
const namespace = process.env.DETAIL_NOTES_NAMESPACE;

if (!local.test(process.env.NEXT_PUBLIC_SUPABASE_URL || "")) {
  throw new Error("detail-notes provider requires disposable local Supabase");
}
if (!/^[0-9]{10,}$/.test(namespace || "")) {
  throw new Error("DETAIL_NOTES_NAMESPACE must be numeric with at least 10 digits");
}

const runId = namespace.slice(-10);
const fixtures = new Map([
  [`OL754${namespace}01W`, { id: `75400000-0000-4000-8000-${runId}01`, label: "stable" }],
  [`OL754${namespace}02W`, { id: `75400000-0000-4000-8000-${runId}02`, label: "abandon" }],
]);
const originalFetch = globalThis.fetch;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);

  if (url.hostname === "openlibrary.org") {
    const match = /^\/works\/(OL754[0-9]+0[12]W)(?:\.json|\/editions\.json)$/.exec(url.pathname);
    const fixture = match && fixtures.get(match[1]);
    if (fixture) {
      await sleep(1_000);
      if (url.pathname.endsWith("/editions.json")) return Response.json({ entries: [] });
      return Response.json({
        title: `QA754 ${namespace} ${fixture.label} hydrated`,
        description: `Synthetic #754 fixture ${namespace}`,
        covers: [],
        authors: [],
        subjects: [],
        first_publish_date: "2024",
      });
    }
  }

  const fixtureTitle = `QA754 ${namespace}`;
  if (url.hostname === "www.googleapis.com" && url.searchParams.get("q")?.includes(fixtureTitle)) {
    return Response.json({ items: [] });
  }
  if (url.hostname.endsWith("inventaire.io") && url.searchParams.get("search")?.includes(fixtureTitle)) {
    return Response.json({ results: [] });
  }

  const abandon = [...fixtures.values()].find((fixture) => fixture.label === "abandon");
  if (
    url.origin === "http://127.0.0.1:54321" &&
    url.pathname === "/rest/v1/saga_items" &&
    (init?.method || "GET") === "GET" &&
    url.searchParams.get("item_id") === `eq.${abandon.id}`
  ) await sleep(1_000);

  return originalFetch(input, init);
};
