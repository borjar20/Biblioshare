import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthSessionMissingError, createClient as createSdkClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { HydratableBook } from "./hydrate-book";
import type { UserRole } from "@/lib/auth/roles";

// Public action, role checks, hydration, representation and SDK builders stay
// real. Only request/session construction, provider results, HTTP and Next
// redirect/invalidation are controlled. This is not an RLS/grant/SQL proof.
const boundary = vi.hoisted(() => ({
  createRequest: vi.fn(), createService: vi.fn(), currentUser: vi.fn(),
  revalidate: vi.fn(), redirect: vi.fn(),
  fetchWork: vi.fn(), fetchFirstEditionDescription: vi.fn(),
  fetchAuthor: vi.fn(), resolveWorkKey: vi.fn(), candidates: vi.fn(),
  entities: vi.fn(), findBestVolume: vi.fn(), fetchVolumeById: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: boundary.createRequest, getCurrentUser: boundary.currentUser }));
vi.mock("@/lib/supabase/service-role", () => ({ createServiceRoleClient: boundary.createService }));
vi.mock("@/lib/reactivity/revalidate", () => ({ revalidateItemPage: boundary.revalidate }));
vi.mock("next/navigation", () => ({ redirect: boundary.redirect }));
vi.mock("@/lib/storage/upload-public-image", () => ({ uploadPublicImage: vi.fn() }));
vi.mock("./tmdb", () => ({ getPosterPaths: vi.fn() }));
vi.mock("./openlibrary/work-detail", () => ({
  fetchWork: boundary.fetchWork, fetchFirstEditionDescription: boundary.fetchFirstEditionDescription,
  fetchWorkCovers: vi.fn(),
}));
vi.mock("./openlibrary/work-authors", () => ({ fetchOpenLibraryAuthorByKey: boundary.fetchAuthor }));
vi.mock("./openlibrary/editions", () => ({ resolveWorkKey: boundary.resolveWorkKey, fetchRepresentationCandidates: boundary.candidates }));
vi.mock("./inventaire/client", async importOriginal => ({
  ...(await importOriginal<typeof import("./inventaire/client")>()),
  searchInventaireEntitiesOrNull: boundary.entities,
}));
vi.mock("./googlebooks/client", () => ({ findBestVolume: boundary.findBestVolume, fetchVolumeById: boundary.fetchVolumeById }));

import { reevaluateRepresentation } from "./edit-actions";
import { needsRepresentationReview, type ReprMeta } from "./representation";

const bookId = "11111111-1111-4111-8111-111111111111";
const actorId = "22222222-2222-4222-8222-222222222222";
const now = Date.parse("2026-10-03T12:00:00.000Z");
const user: User = { id: actorId, aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00.000Z" };
const selectedColumns = [
  "id", "openlibrary_work_key", "google_books_volume_id", "isbn", "hydrated_at", "repr_meta",
  "wikidata_id", "title", "author", "synopsis", "cover_url", "total_pages",
];
type ClientKind = "request" | "service";
type HttpCall = { client: ClientKind; method: string; path: string; query: URLSearchParams; body: Record<string, unknown> | null; accept: string | null };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
type Signal = ReturnType<typeof deferred<void>>;
type State = {
  authenticated: boolean; role: UserRole | null; book: HydratableBook;
  resetError: boolean; missingBook: boolean;
  rpcFailure: "none" | "resolved" | "rejected"; serviceConstructionFailure: boolean;
  roleGate?: Signal; resetGate?: Signal; rpcGate?: Signal;
  roleReached: Signal; resetReached: Signal; rpcReached: Signal;
};
let state: State;
let trace: string[];
let http: HttpCall[];
let request: SupabaseClient<Database>;
let service: SupabaseClient<Database>;

function completeRecentBook(): HydratableBook {
  return {
    id: bookId, openlibrary_work_key: "/works/OL897W", google_books_volume_id: null, isbn: null,
    hydrated_at: new Date(now).toISOString(),
    repr_meta: {
      title: { lang: "es", source: "manual" }, cover: { lang: "es", source: "manual" },
      synopsis: { lang: "es", source: "manual" },
    },
    wikidata_id: "Q897", title: "Curated title", author: "Curated author", synopsis: "Curated synopsis",
    cover_url: "https://covers.openlibrary.org/b/id/897-L.jpg", total_pages: 200,
  };
}
function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}
async function localFetch(client: ClientKind, input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const req = new Request(input, init);
  const url = new URL(req.url);
  const body = req.method === "GET" ? null : JSON.parse(await req.text()) as Record<string, unknown>;
  http.push({ client, method: req.method, path: url.pathname, query: url.searchParams, body, accept: req.headers.get("accept") });
  if (url.pathname === "/rest/v1/profiles" && req.method === "GET") {
    trace.push("role:started"); state.roleReached.resolve();
    await state.roleGate?.promise;
    trace.push("role:completed");
    return json(state.role === null ? [] : [{ role: state.role }]);
  }
  if (url.pathname === "/rest/v1/books" && req.method === "PATCH") {
    trace.push(client + ":reset:started"); state.resetReached.resolve();
    await state.resetGate?.promise;
    if (state.resetError) return json({ code: "42501", message: "CONTROLLED_RESET_DENIED", details: null, hint: null }, 403);
    if (state.missingBook) return json(null);
    // Model only the returned row for this PATCH, never PostgreSQL privileges.
    state.book = { ...state.book, ...body } as HydratableBook;
    trace.push(client + ":reset:completed");
    return json(state.book);
  }
  if (url.pathname === "/rest/v1/rpc/hydrate_book" && req.method === "POST") {
    trace.push(client + ":hydrate:started"); state.rpcReached.resolve();
    await state.rpcGate?.promise;
    if (state.rpcFailure === "rejected") throw new Error("CONTROLLED_HYDRATION_TRANSPORT_FAILURE");
    if (client !== "service" || state.rpcFailure === "resolved") {
      return json({ code: "42501", message: "CONTROLLED_HYDRATION_DENIED", details: null, hint: null }, 403);
    }
    trace.push("service:hydrate:completed");
    return json(null);
  }
  throw new Error("UNEXPECTED_LOCAL_HTTP_ROUTE: " + req.method + " " + url.pathname);
}
function sdkClient(kind: ClientKind): SupabaseClient<Database> {
  return createSdkClient<Database>("https://catalog-representation897.invalid", "fixture-" + kind + "-key", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => localFetch(kind, input, init) },
  });
}
function calls(client: ClientKind, method: string, path: string) {
  return http.filter(call => call.client === client && call.method === method && call.path === path);
}
function expectNoHydrationOrInvalidation() {
  expect(boundary.fetchWork).not.toHaveBeenCalled();
  expect(boundary.candidates).not.toHaveBeenCalled();
  expect(boundary.createService).not.toHaveBeenCalled();
  expect(boundary.revalidate).not.toHaveBeenCalled();
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(Date, "now").mockReturnValue(now);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("UNEXPECTED_NATIVE_FETCH"); }));
  trace = []; http = [];
  state = {
    authenticated: true, role: "collaborator", book: completeRecentBook(),
    resetError: false, missingBook: false, rpcFailure: "none", serviceConstructionFailure: false,
    roleReached: deferred<void>(), resetReached: deferred<void>(), rpcReached: deferred<void>(),
  };
  request = sdkClient("request"); service = sdkClient("service");
  vi.spyOn(request.auth, "getUser").mockImplementation(async () => {
    trace.push("auth");
    return state.authenticated ? { data: { user }, error: null } : { data: { user: null }, error: new AuthSessionMissingError() };
  });
  boundary.createRequest.mockImplementation(async () => { trace.push("request:constructed"); return request; });
  boundary.currentUser.mockImplementation(async () => state.authenticated ? user : null);
  boundary.createService.mockImplementation(() => {
    trace.push("service:constructed");
    if (state.serviceConstructionFailure) throw new Error("CONTROLLED_SERVICE_CONSTRUCTION_FAILURE");
    return service;
  });
  boundary.redirect.mockImplementation((path: string) => { throw new Error("CONTROLLED_NEXT_REDIRECT:" + path); });
  boundary.revalidate.mockImplementation(() => { trace.push("revalidate"); });
  boundary.fetchWork.mockImplementation(async () => {
    trace.push("provider:work");
    return { title: "Provider title", description: "Provider description", subjects: ["Fantasy"], coverUrl: "https://covers.openlibrary.org/b/id/898-L.jpg", authorKeys: ["OL897A"], firstPublishYear: 2019 };
  });
  boundary.fetchFirstEditionDescription.mockResolvedValue(null);
  boundary.fetchAuthor.mockResolvedValue({ name: "Provider author" });
  boundary.resolveWorkKey.mockResolvedValue(null);
  boundary.candidates.mockResolvedValue({ es: null, en: null, pagesMedian: null });
  boundary.entities.mockResolvedValue([]);
  boundary.findBestVolume.mockResolvedValue(null);
  boundary.fetchVolumeById.mockResolvedValue(null);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("reevaluateRepresentation through real hydration and SDK HTTP builders", () => {
  it("resets a complete recent book with request identity, then hydrates with service identity and invalidates", async () => {
    expect(needsRepresentationReview(state.book.hydrated_at, state.book.repr_meta as ReprMeta, state.book.wikidata_id)).toBe(false);
    expect(await reevaluateRepresentation(bookId)).toEqual({ ok: true });
    const resets = calls("request", "PATCH", "/rest/v1/books");
    expect(resets).toHaveLength(1);
    expect(resets[0].body).toEqual({ hydrated_at: null });
    expect(resets[0].query.get("id")).toBe("eq." + bookId);
    expect(resets[0].query.get("select")?.split(",").sort()).toEqual([...selectedColumns].sort());
    expect(resets[0].accept).toBe("application/vnd.pgrst.object+json");
    expect(calls("service", "PATCH", "/rest/v1/books")).toEqual([]);
    const roles = calls("request", "GET", "/rest/v1/profiles");
    expect(roles).toHaveLength(1); expect(roles[0].query.get("select")).toBe("role");
    expect(roles[0].query.get("user_id")).toBe("eq." + actorId);
    expect(trace.indexOf("auth")).toBeLessThan(trace.indexOf("role:completed"));
    expect(trace.indexOf("role:completed")).toBeLessThan(trace.indexOf("request:reset:started"));
    expect(trace.indexOf("request:reset:completed")).toBeLessThan(trace.indexOf("provider:work"));
    expect(boundary.fetchWork).toHaveBeenCalledWith("/works/OL897W");
    expect(boundary.candidates).toHaveBeenCalledWith("/works/OL897W");
    const hydrations = calls("service", "POST", "/rest/v1/rpc/hydrate_book");
    expect(hydrations).toHaveLength(1);
    expect(hydrations[0].body).toMatchObject({ p_book_id: bookId, p_author: "Provider author", p_genres: ["Fantasía"], p_published_year: 2019 });
    expect(hydrations[0].body?.p_fields).toMatchObject({ title: { value: "Provider title", source: "openlibrary" } });
    expect(calls("request", "POST", "/rest/v1/rpc/hydrate_book")).toEqual([]);
    expect(trace.indexOf("service:hydrate:completed")).toBeLessThan(trace.indexOf("revalidate"));
    expect(boundary.revalidate).toHaveBeenCalledExactlyOnceWith("book", bookId);
    expect(vi.mocked(console.error)).not.toHaveBeenCalled();
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });
  it.each(["user", null] as const)("blocks role %s before any reset, provider or service operation", async role => {
    state.role = role;
    expect(await reevaluateRepresentation(bookId)).toEqual({ error: "forbidden" });
    expect(http.map(call => call.path)).toEqual(["/rest/v1/profiles"]);
    expectNoHydrationOrInvalidation();
  });
  it("inherits the collaborator gate for an admin", async () => {
    state.role = "admin";
    expect(await reevaluateRepresentation(bookId)).toEqual({ ok: true });
    expect(calls("request", "PATCH", "/rest/v1/books")).toHaveLength(1);
    expect(calls("service", "POST", "/rest/v1/rpc/hydrate_book")).toHaveLength(1);
  });
  it("redirects a missing SDK session before looking up a role or writing", async () => {
    state.authenticated = false;
    await expect(reevaluateRepresentation(bookId)).rejects.toThrow("CONTROLLED_NEXT_REDIRECT:/login");
    expect(boundary.redirect).toHaveBeenCalledExactlyOnceWith("/login");
    expect(http).toEqual([]); expect(boundary.currentUser).not.toHaveBeenCalled();
    expectNoHydrationOrInvalidation();
  });
  it.each(["", "not-a-uuid", bookId + "/../../other"])("rejects invalid book identity %s before constructing a request client", async id => {
    expect(await reevaluateRepresentation(id)).toEqual({ error: "generic" });
    expect(boundary.createRequest).not.toHaveBeenCalled(); expect(http).toEqual([]);
    expectNoHydrationOrInvalidation();
  });
  it("waits for the real role lookup before starting the reset", async () => {
    const gate = deferred<void>(); state.roleGate = gate;
    const action = reevaluateRepresentation(bookId);
    try {
      await state.roleReached.promise;
      expect(http.map(call => call.path)).toEqual(["/rest/v1/profiles"]);
      expectNoHydrationOrInvalidation();
      gate.resolve(); expect(await action).toEqual({ ok: true });
    } finally { gate.resolve(); await action; }
  });
  it("waits for the reset response before any hydration work", async () => {
    const gate = deferred<void>(); state.resetGate = gate;
    const action = reevaluateRepresentation(bookId);
    try {
      await state.resetReached.promise;
      expectNoHydrationOrInvalidation();
      expect(state.book.hydrated_at).not.toBeNull();
      gate.resolve(); expect(await action).toEqual({ ok: true });
      expect(state.book.hydrated_at).toBeNull();
    } finally { gate.resolve(); await action; }
  });
  it.each(["denied", "missing"] as const)("stops after a %s reset result instead of hydrating a nonexistent success", async result => {
    state.resetError = result === "denied"; state.missingBook = result === "missing";
    expect(await reevaluateRepresentation(bookId)).toEqual({ error: "generic" });
    expect(calls("request", "PATCH", "/rest/v1/books")).toHaveLength(1);
    expectNoHydrationOrInvalidation();
  });
  it("keeps provider rejection nonfatal after a successful reset", async () => {
    boundary.fetchWork.mockRejectedValue(new Error("CONTROLLED_PROVIDER_FAILURE"));
    expect(await reevaluateRepresentation(bookId)).toEqual({ ok: true });
    expect(calls("request", "PATCH", "/rest/v1/books")).toHaveLength(1);
    expect(boundary.createService).not.toHaveBeenCalled();
    expect(vi.mocked(console.error)).toHaveBeenCalledWith("ensureBookHydrated failed", expect.objectContaining({ bookId }));
    expect(boundary.revalidate).toHaveBeenCalledExactlyOnceWith("book", bookId);
  });
  it("keeps an unavailable work result nonfatal without inventing a hydrate RPC", async () => {
    boundary.fetchWork.mockResolvedValue(null);
    expect(await reevaluateRepresentation(bookId)).toEqual({ ok: true });
    expect(boundary.createService).not.toHaveBeenCalled();
    expect(vi.mocked(console.error)).not.toHaveBeenCalled();
    expect(boundary.revalidate).toHaveBeenCalledExactlyOnceWith("book", bookId);
  });
  it.each(["resolved", "rejected"] as const)("keeps %s hydration failure nonfatal and observable", async failure => {
    state.rpcFailure = failure;
    expect(await reevaluateRepresentation(bookId)).toEqual({ ok: true });
    expect(calls("service", "POST", "/rest/v1/rpc/hydrate_book")).toHaveLength(1);
    expect(calls("request", "POST", "/rest/v1/rpc/hydrate_book")).toEqual([]);
    expect(vi.mocked(console.error)).toHaveBeenCalledWith("hydrate_book rpc failed", expect.objectContaining({ bookId }));
    expect(boundary.revalidate).toHaveBeenCalledExactlyOnceWith("book", bookId);
  });
  it("keeps service construction failure nonfatal after the authenticated reset", async () => {
    state.serviceConstructionFailure = true;
    expect(await reevaluateRepresentation(bookId)).toEqual({ ok: true });
    expect(calls("request", "PATCH", "/rest/v1/books")).toHaveLength(1);
    expect(calls("service", "POST", "/rest/v1/rpc/hydrate_book")).toEqual([]);
    expect(vi.mocked(console.error)).toHaveBeenCalledWith("ensureBookHydrated failed", expect.objectContaining({ bookId }));
    expect(boundary.revalidate).toHaveBeenCalledExactlyOnceWith("book", bookId);
  });
  it("waits for hydration to settle before returning success or invalidating", async () => {
    const gate = deferred<void>(); state.rpcGate = gate;
    let settled = false;
    const action = reevaluateRepresentation(bookId).then(result => { settled = true; return result; });
    try {
      await state.rpcReached.promise;
      expect(settled).toBe(false); expect(boundary.revalidate).not.toHaveBeenCalled();
      gate.resolve(); expect(await action).toEqual({ ok: true });
      expect(trace.indexOf("service:hydrate:completed")).toBeLessThan(trace.indexOf("revalidate"));
    } finally { gate.resolve(); await action; }
  });
});
