import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { test } from "node:test";
import ts from "typescript";
import { withClubRoundFixture } from "./club-round-fixture";

type SpecCallback = (fixture: { page: { goto(path: string): Promise<void> } }) => Promise<void>;

// Register and execute the actual Playwright callback with controlled boundaries.
// This catches a guard that exists in a helper but is bypassed by the real spec.
async function replaySpec(options: {
  membershipStatus?: number;
  cleanupStatus?: number;
  clubStatus?: number;
  membershipError?: Error;
  cleanupError?: Error;
}) {
  const specPath = resolve("e2e/club-ronda.spec.ts");
  const nativeRequire = createRequire(specPath);
  const source = readFileSync(specPath, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: specPath,
  }).outputText;
  let callback: SpecCallback | undefined;
  const register = Object.assign(
    (_name: string, body: SpecCallback) => { callback = body; },
    { setTimeout() {} },
  );
  const uiFailure = new Error("controlled first UI checkpoint");
  const calls: string[] = [];
  let loginReached = false;
  const transport: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    calls.push(`${method} ${url.pathname}${url.search}`);
    if (url.pathname === "/rest/v1/profiles" && method === "GET") {
      return Response.json([{ user_id: "fixture-owner" }]);
    }
    if (url.pathname === "/rest/v1/clubs" && method === "POST") {
      const status = options.clubStatus ?? 201;
      return Response.json(status < 300 ? [{ id: "fixture-club" }] : { message: "untrusted error body" }, { status });
    }
    if (url.pathname === "/rest/v1/club_members" && method === "POST") {
      if (options.membershipError) throw options.membershipError;
      return new Response(null, { status: options.membershipStatus ?? 201 });
    }
    if (url.pathname === "/rest/v1/clubs" && method === "DELETE") {
      if (options.cleanupError) throw options.cleanupError;
      return new Response(null, { status: options.cleanupStatus ?? 204 });
    }
    throw new Error(`Unexpected fixture operation: ${method} ${url.pathname}`);
  };
  const requireStub = (id: string) => {
    if (id === "@playwright/test") return {
      test: register,
      expect() { throw new Error("The controlled UI checkpoint should stop before assertions"); },
    };
    if (id === "./support/club-round-fixture") return nativeRequire(id);
    throw new Error(`Unexpected spec import: ${id}`);
  };
  // Only synthetic configuration; never load the environment or local secrets.
  const environment = {
    NEXT_PUBLIC_SUPABASE_URL: "https://fixture.invalid",
    SUPABASE_SERVICE_ROLE_KEY: "fixture-only",
    TEST_USER_USERNAME: "fixture_owner",
  };
  new Function("require", "exports", "process", "fetch", compiled)(requireStub, {}, { env: environment }, transport);
  assert.ok(callback, "the actual club-ronda Playwright callback must be registered");
  let error: unknown;
  try {
    await callback({ page: {
      async goto(path) {
        assert.equal(path, "/login", "first UI operation must be the real login entry");
        calls.push(`UI ${path}`);
        loginReached = true;
        throw uiFailure;
      },
    } });
  } catch (caught) { error = caught; }
  return { error, uiFailure, loginReached, calls };
}

function assertHttpError(error: unknown, operation: string, status: number) {
  assert.ok(error instanceof Error);
  assert.ok(error.message.includes(operation), error.message);
  assert.ok(error.message.includes(`HTTP ${status}`), error.message);
}

function assertExactClubCleanup(calls: string[]) {
  assert.deepEqual(calls.filter((call) => call.startsWith("DELETE ")), ["DELETE /rest/v1/clubs?id=eq.fixture-club"]);
}

test("a membership POST 403 rejects before the real spec reaches login and cleans its club", async () => {
  const result = await replaySpec({ membershipStatus: 403 });
  assert.equal(result.loginReached, false);
  assertHttpError(result.error, "POST club_members", 403);
  assertExactClubCleanup(result.calls);
});

test("membership 201 reaches the actual UI callback; empty cleanup 204 preserves the UI failure", async () => {
  const result = await replaySpec({ membershipStatus: 201, cleanupStatus: 204 });
  assert.equal(result.loginReached, true);
  assert.equal(result.error, result.uiFailure);
  assert.ok(result.calls.indexOf("POST /rest/v1/club_members") < result.calls.indexOf("UI /login"));
  assertExactClubCleanup(result.calls);
});

test("cleanup 500 reports both the original UI failure and its HTTP failure", async () => {
  const result = await replaySpec({ cleanupStatus: 500 });
  assert.ok(result.error instanceof AggregateError);
  assert.equal(result.error.errors.length, 2);
  assert.equal(result.error.errors[0], result.uiFailure);
  assertHttpError(result.error.errors[1], "DELETE clubs", 500);
  assertExactClubCleanup(result.calls);
});

test("membership 403 and cleanup 500 report both failures without entering login", async () => {
  const result = await replaySpec({ membershipStatus: 403, cleanupStatus: 500 });
  assert.equal(result.loginReached, false);
  assert.ok(result.error instanceof AggregateError);
  assert.equal(result.error.errors.length, 2);
  assertHttpError(result.error.errors[0], "POST club_members", 403);
  assertHttpError(result.error.errors[1], "DELETE clubs", 500);
  assertExactClubCleanup(result.calls);
});

test("club POST 403 is localized before JSON shape, membership or UI work", async () => {
  const result = await replaySpec({ clubStatus: 403 });
  assertHttpError(result.error, "POST clubs", 403);
  assert.equal(result.loginReached, false);
  assert.equal(result.calls.some((call) => call.startsWith("POST /rest/v1/club_members")), false);
  assert.deepEqual(result.calls.filter((call) => call.startsWith("DELETE ")), []);
  assert.ok(!(result.error as Error).message.includes("untrusted error body"));
});

test("a rejected membership transport preserves its original failure and still cleans the club", async () => {
  const membershipError = new Error("controlled transport rejection");
  const result = await replaySpec({ membershipError });
  assert.equal(result.loginReached, false);
  assert.equal(result.error, membershipError);
  assertExactClubCleanup(result.calls);
});

test("a rejected cleanup transport keeps both setup and cleanup causes", async () => {
  const cleanupError = new Error("controlled cleanup transport rejection");
  const result = await replaySpec({ membershipStatus: 403, cleanupError });
  assert.equal(result.loginReached, false);
  assert.ok(result.error instanceof AggregateError);
  assertHttpError(result.error.errors[0], "POST club_members", 403);
  assert.equal(result.error.errors[1], cleanupError);
  assertExactClubCleanup(result.calls);
});

for (const cleanupStatus of [204, 500]) {
  test(`a successful fixture body ${cleanupStatus === 204 ? "returns its result after cleanup 204" : "reports cleanup 500 as the only failure"}`, async () => {
    const calls: string[] = [];
    let bodyReached = false;
    const transport: typeof fetch = async (input, init) => {
      const url = new URL(String(input));
      calls.push(`${init?.method} ${url.pathname}${url.search}`);
      if (init?.method === "DELETE") return new Response(null, { status: cleanupStatus });
      if (url.pathname === "/rest/v1/clubs") return Response.json([{ id: "fixture-club" }], { status: 201 });
      assert.equal(url.pathname, "/rest/v1/club_members");
      return new Response(null, { status: 201 });
    };
    const result = withClubRoundFixture({
      supabaseUrl: "https://fixture.invalid", headers: {}, ownerId: "fixture-owner", timestamp: 1,
    }, async ({ clubId }) => {
      assert.equal(clubId, "fixture-club");
      bodyReached = true;
      return "completed";
    }, transport);
    if (cleanupStatus === 204) assert.equal(await result, "completed");
    else await assert.rejects(result, (error: unknown) => {
      assert.ok(!(error instanceof AggregateError), "there was no primary failure to aggregate");
      assertHttpError(error, "DELETE clubs", 500);
      return true;
    });
    assert.equal(bodyReached, true);
    assertExactClubCleanup(calls);
  });
}
