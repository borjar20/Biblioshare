import { expect, test, type APIRequestContext } from "@playwright/test";
import { withBattleUsers } from "./support/battle-users";
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
