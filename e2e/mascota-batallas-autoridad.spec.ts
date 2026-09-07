import { expect, test, type APIRequestContext } from "@playwright/test";
import { withBattleUsers } from "./support/battle-users";
import { resolveFinalEmpire } from "./support/book-fixture";
import normative from "../src/lib/pet/battle/versions/r2.2/normative.json";
import { replayBattle } from "../src/lib/pet/battle/replay";
import type { BattleRecord } from "../src/lib/pet/battle/types";

// R1 (contrato C1, #1081 R1): pet_battles la escribe SOLO el servidor. Este spec
// habla con PostgREST directamente, sin navegador: dos cuentas desechables (patrón
// de avisos-por-persona.spec.ts), una fila creada con service_role, y después
// cada cosa que un cliente podría intentar para fabricarse una victoria.
// Necesita el dev server arrancado (globalSetup) aunque no abra ninguna página.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const REST = `${SUPABASE_URL}/rest/v1/pet_battles`;

function adminHeaders(json = false) {
  return {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    ...(json ? { "Content-Type": "application/json", Prefer: "return=representation" } : {}),
  };
}

function userHeaders(token: string, json = false) {
  return {
    apikey: ANON_KEY,
    Authorization: `Bearer ${token}`,
    ...(json ? { "Content-Type": "application/json", Prefer: "return=representation" } : {}),
  };
}

async function userToken(request: APIRequestContext, email: string, password: string): Promise<string> {
  const res = await request.post(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    data: { email, password },
  });
  expect(res.ok()).toBe(true);
  return (await res.json()).access_token as string;
}

const SEED = "0123456789abcdef0123456789abcdef";
const SNAPSHOT = {
  name: "Nuez",
  petClass: "wizard",
  stage: "young",
  attributes: { FUE: 0, CON: 0, INT: 0, SAB: 0, CAR: 0, DES: 0 },
  tier: 1,
  hpMax: 110,
  atk: 10,
};

function openRow(userId: string) {
  return {
    user_id: userId,
    intent_id: crypto.randomUUID(),
    kind: "training",
    enemy_id: "brote",
    ruleset_version: "r2.2",
    content_hash: "0".repeat(64),
    seed: SEED,
    snapshot: SNAPSHOT,
  };
}

test("pet_battles: el cliente lee lo suyo y no puede insertar, editar, borrar ni ver lo ajeno", async ({ request }) => {
  test.setTimeout(60_000);
  const stamp = Date.now();
  await withBattleUsers(SUPABASE_URL, SERVICE_KEY, async (createUser) => {
    const a = await createUser( `batallaa${stamp}`.slice(0, 20));
    const b = await createUser( `batallab${stamp}`.slice(0, 20));
    const tokenA = await userToken(request, a.email, a.password);
    const tokenB = await userToken(request, b.email, b.password);

    // Solo el servidor (service_role) crea combates.
    const created = await request.post(REST, { headers: adminHeaders(true), data: openRow(a.id) });
    expect(created.ok()).toBe(true);
    const [row] = (await created.json()) as Array<{ id: string }>;

    // A ve su combate, con seed y snapshot: los necesita para simular en vivo.
    const mine = await request.get(`${REST}?select=id,seed,status,result&user_id=eq.${a.id}`, { headers: userHeaders(tokenA) });
    expect(mine.status()).toBe(200);
    const rows = (await mine.json()) as Array<{ id: string; seed: string; status: string; result: unknown }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: row.id, seed: SEED, status: "open", result: null });

    // A no puede fabricarse una victoria: ni insertando…
    const insert = await request.post(REST, { headers: userHeaders(tokenA, true), data: openRow(a.id) });
    expect(insert.status()).toBe(403);
    expect((await insert.json()).code).toBe("42501");

    // …ni resolviendo su combate a mano…
    const patch = await request.patch(`${REST}?id=eq.${row.id}`, {
      headers: userHeaders(tokenA, true),
      data: { status: "resolved", inputs: [], result: { outcome: "win" }, digest: "0".repeat(64), resolved_at: new Date().toISOString() },
    });
    expect(patch.status()).toBe(403);
    expect((await patch.json()).code).toBe("42501");

    // …ni borrándolo.
    const del = await request.delete(`${REST}?id=eq.${row.id}`, { headers: userHeaders(tokenA) });
    expect(del.status()).toBe(403);

    // B no ve los combates de A ni puede crearle uno.
    const theirs = await request.get(`${REST}?select=id&user_id=eq.${a.id}`, { headers: userHeaders(tokenB) });
    expect(theirs.status()).toBe(200);
    expect(await theirs.json()).toEqual([]);
    const forge = await request.post(REST, { headers: userHeaders(tokenB, true), data: openRow(a.id) });
    expect(forge.status()).toBe(403);

    // Both accounts have data: an empty table cannot make isolation pass.
    const createdB = await request.post(REST, { headers: adminHeaders(true), data: openRow(b.id) });
    expect(createdB.ok()).toBe(true);
    const [rowB] = await createdB.json() as Array<{ id: string }>;
    const mineB = await request.get(`${REST}?select=id&user_id=eq.${b.id}`, { headers: userHeaders(tokenB) });
    expect(await mineB.json()).toEqual([{ id: rowB.id }]);
    const hiddenB = await request.get(`${REST}?select=id&user_id=eq.${b.id}`, { headers: userHeaders(tokenA) });
    expect(await hiddenB.json()).toEqual([]);

    // Sin sesión, nada.
    const anon = await request.get(`${REST}?select=id`, { headers: { apikey: ANON_KEY } });
    expect([401, 403]).toContain(anon.status());
    for (const method of ["POST", "PATCH", "DELETE"]) {
      const denied = await request.fetch(`${REST}?id=eq.${row.id}`, {
        method, headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
        ...(method === "DELETE" ? {} : { data: method === "POST" ? openRow(a.id) : { kind: "training" } }),
      });
      expect([401, 403]).toContain(denied.status());
    }

    // La fila sigue intacta después de todos los intentos.
    const after = await request.get(`${REST}?select=status,result&id=eq.${row.id}`, { headers: adminHeaders() });
    expect(await after.json()).toEqual([{ status: "open", result: null }]);
  });
});

test("pet_battles: persisted historical record replays with its retained release", async ({ request }) => {
  await withBattleUsers(SUPABASE_URL, SERVICE_KEY, async (createUser) => {
    const user = await createUser(`battleold${Date.now()}`.slice(0, 20));
    const record = normative.record;
    const data = {
      ...openRow(user.id), ruleset_version: record.rulesetVersion, content_hash: record.contentHash,
      enemy_id: record.enemyId, seed: record.seed, snapshot: record.snapshot,
      status: "resolved", inputs: record.inputs, result: record.result, digest: normative.digest,
      resolved_at: new Date().toISOString(),
    };
    const created = await request.post(REST, { headers: adminHeaders(true), data });
    expect(created.ok()).toBe(true);
    const duplicate = await request.post(REST, { headers: adminHeaders(true), data });
    expect(duplicate.status()).toBe(409);
    expect((await duplicate.json()).code).toBe("23505");
    const token = await userToken(request, user.email, user.password);
    const read = await request.get(`${REST}?user_id=eq.${user.id}`, { headers: userHeaders(token) });
    expect(read.status()).toBe(200);
    const rows = await read.json();
    expect(rows).toHaveLength(1);
    const row = rows[0];
    const saved: BattleRecord = {
      rulesetVersion: row.ruleset_version, contentHash: row.content_hash, enemyId: row.enemy_id,
      seed: row.seed, snapshot: row.snapshot, inputs: row.inputs, result: row.result,
    };
    const replay = await replayBattle(saved);
    expect(replay).toEqual({ ok: true, events: normative.events, result: record.result, digest: row.digest });
    expect(row.digest).toBe(normative.digest);
  });
});

// R4a: aventuras (spec docs/superpowers/specs/2026-09-06-mascota-r4a-aventuras-design.md
// §5-§6). Igual que el bloque de arriba, sin navegador: fabricar una fila de aventura
// como usuario, ejecutar las funciones de escritura con JWT de usuario, y dos inicios
// y dos resoluciones concurrentes con service_role para probar que la serialización
// por usuario (advisory lock) hace convergentes las dos carreras.

// `passes_one_active` (20260716_pass_hub_a_columns.sql) permite como mucho un pase
// activo por (user_id, item_type, item_id): sembrar dos días para la MISMA cuenta con
// el mismo libro fixture reutiliza el pase existente en vez de reinsertarlo.
async function seedActivity(request: APIRequestContext, userId: string, daysAgo: number) {
  const book = await resolveFinalEmpire<{ id: string }>(SUPABASE_URL, adminHeaders(), "id");
  const existing = await request.get(`${SUPABASE_URL}/rest/v1/passes?user_id=eq.${userId}&item_id=eq.${book.id}&select=id`, { headers: adminHeaders() });
  expect(existing.ok()).toBe(true);
  const found = await existing.json() as Array<{ id: string }>;
  let passId = found[0]?.id;
  if (!passId) {
    const pass = await request.post(`${SUPABASE_URL}/rest/v1/passes`, { headers: adminHeaders(true), data: { user_id: userId, item_type: "book", item_id: book.id, is_active: true } });
    expect(pass.ok()).toBe(true);
    [{ id: passId }] = await pass.json() as Array<{ id: string }>;
  }
  const day = new Date(Date.now() - daysAgo * 86_400_000).toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });
  const session = await request.post(`${SUPABASE_URL}/rest/v1/progress_sessions`, { headers: adminHeaders(true), data: { user_id: userId, pass_id: passId, duration_minutes: 20, session_date: day, position: {} } });
  expect(session.ok()).toBe(true);
  return day;
}

async function cleanPreviousAuthorityRun(request: APIRequestContext) {
  const response = await request.get(`${SUPABASE_URL}/rest/v1/profiles?username=eq.r4autha&select=user_id`, { headers: adminHeaders() });
  expect(response.ok()).toBe(true);
  for (const { user_id } of await response.json() as Array<{ user_id: string }>) {
    const account = await request.get(`${SUPABASE_URL}/auth/v1/admin/users/${user_id}`, { headers: adminHeaders() });
    expect(account.ok()).toBe(true);
    const { email } = await account.json() as { email: string };
    expect(email).toBe("r4autha@example.com");
    expect((await request.delete(`${SUPABASE_URL}/auth/v1/admin/users/${user_id}`, { headers: adminHeaders() })).ok()).toBe(true);
  }
}

test("aventuras: nadie fabrica una fila ni ejecuta las funciones de escritura; dos inicios concurrentes convergen", async ({ request }) => {
  test.setTimeout(90_000);
  await cleanPreviousAuthorityRun(request);
  await withBattleUsers(SUPABASE_URL, SERVICE_KEY, async (createUser) => {
    const a = await createUser("r4autha");
    expect((await request.post(`${SUPABASE_URL}/rest/v1/pet_state`, { headers: adminHeaders(true), data: { user_id: a.id, name: "Nuez", class: "wizard" } })).ok()).toBe(true);
    // Dos días de actividad reales antes de los inicios concurrentes, para que
    // el paso 5 (un nuevo start tras ganar) tenga un segundo día que consumir.
    await seedActivity(request, a.id, 0);
    await seedActivity(request, a.id, 1);
    const token = await userToken(request, a.email, a.password);
    // 1. inserción directa de una fila de aventura como usuario: denegada
    const forged = await request.post(REST, { headers: userHeaders(token, true), data: { ...openRow(a.id), kind: "adventure", adventure_day: "2026-09-07", attempt: 1 } });
    expect([401, 403]).toContain(forged.status());
    // 2. Firma completa: un 404 por argumentos ausentes no demuestra falta de EXECUTE.
    const args = (n: string) => ({ p_user: a.id, p_seed: n.repeat(32), p_intent: crypto.randomUUID(), p_enemies: "brote,brote,brote", p_ruleset_version: "r4.1", p_content_hash: "a".repeat(64), p_snapshot: SNAPSHOT });
    const deniedCalls = [
      { fn: "start_pet_adventure", data: args("1") },
      { fn: "resolve_pet_adventure", data: { p_user: a.id, p_intent: crypto.randomUUID(), p_inputs: [], p_result: { outcome: "lose", reason: "ko", fight: 1 }, p_digest: "b".repeat(64), p_reward_order: [] } },
    ];
    for (const { fn, data } of deniedCalls) {
      const res = await request.post(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, { headers: userHeaders(token, true), data });
      expect(res.status()).toBe(403);
      expect(await res.json()).toMatchObject({ code: "42501", message: `permission denied for function ${fn}` });
    }
    // 3. dos inicios concurrentes con service_role (dos conexiones PostgREST reales) → la misma fila
    const [r1, r2] = await Promise.all([
      request.post(`${SUPABASE_URL}/rest/v1/rpc/start_pet_adventure`, { headers: adminHeaders(true), data: args("1") }),
      request.post(`${SUPABASE_URL}/rest/v1/rpc/start_pet_adventure`, { headers: adminHeaders(true), data: args("2") }),
    ]);
    expect(r1.ok() && r2.ok()).toBe(true);
    const [[row1], [row2]] = await Promise.all([r1.json(), r2.json()]) as Array<Array<{ intent_id: string; adventure_day: string }>>;
    expect(row1.intent_id).toBe(row2.intent_id);
    const all = await (await request.get(`${REST}?user_id=eq.${a.id}&kind=eq.adventure&select=id`, { headers: adminHeaders() })).json() as unknown[];
    expect(all).toHaveLength(1);
    // 4. dos resoluciones concurrentes de una victoria → una sola recompensa, mismo digest
    const resolveArgs = (d: string) => ({ p_user: a.id, p_intent: row1.intent_id, p_inputs: [], p_result: { outcome: "win", reason: "ko", fight: 3 }, p_digest: d.repeat(64), p_reward_order: [{ itemId: "loan_pendant", slot: "amulet" }, { itemId: "sharp_bookmark", slot: "weapon" }] });
    const [s1, s2] = await Promise.all([
      request.post(`${SUPABASE_URL}/rest/v1/rpc/resolve_pet_adventure`, { headers: adminHeaders(true), data: resolveArgs("b") }),
      request.post(`${SUPABASE_URL}/rest/v1/rpc/resolve_pet_adventure`, { headers: adminHeaders(true), data: resolveArgs("c") }),
    ]);
    const [[w1], [w2]] = await Promise.all([s1.json(), s2.json()]) as Array<Array<{ digest: string; reward: { itemId: string } }>>;
    expect(w1.digest).toBe(w2.digest);
    expect(w1.reward).toEqual(w2.reward);
    expect(w1.reward.itemId).toBe("loan_pendant");
    // 5. un nuevo start no reabre el día ganado: consume el otro día pendiente
    const next = await (await request.post(`${SUPABASE_URL}/rest/v1/rpc/start_pet_adventure`, { headers: adminHeaders(true), data: args("3") })).json() as Array<{ adventure_day: string; attempt: number }>;
    expect(next[0].adventure_day).not.toBe(row1.adventure_day);
    expect(next[0].attempt).toBe(1);
  });
});
