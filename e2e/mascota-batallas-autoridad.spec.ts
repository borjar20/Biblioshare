import { expect, test, type APIRequestContext } from "@playwright/test";

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

async function createUser(request: APIRequestContext, username: string) {
  const email = `${username}@example.com`;
  const password = "TestPassword123!";
  const auth = await request.post(`${SUPABASE_URL}/auth/v1/admin/users`, {
    headers: adminHeaders(),
    data: { email, password, email_confirm: true },
  });
  expect(auth.ok()).toBe(true);
  const user = await auth.json();
  const profile = await request.post(`${SUPABASE_URL}/rest/v1/profiles`, {
    headers: adminHeaders(true),
    data: { user_id: user.id, username, is_public: true },
  });
  expect(profile.ok()).toBe(true);
  return { id: user.id as string, username, email, password };
}

async function userToken(request: APIRequestContext, email: string, password: string): Promise<string> {
  const res = await request.post(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    data: { email, password },
  });
  expect(res.ok()).toBe(true);
  return (await res.json()).access_token as string;
}

async function deleteUser(id: string) {
  await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${id}`, { method: "DELETE", headers: adminHeaders() });
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
  const a = await createUser(request, `batallaa${stamp}`.slice(0, 20));
  const b = await createUser(request, `batallab${stamp}`.slice(0, 20));
  try {
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

    // Sin sesión, nada.
    const anon = await request.get(`${REST}?select=id`, { headers: { apikey: ANON_KEY } });
    expect([401, 403]).toContain(anon.status());

    // La fila sigue intacta después de todos los intentos.
    const after = await request.get(`${REST}?select=status,result&id=eq.${row.id}`, { headers: adminHeaders() });
    expect(await after.json()).toEqual([{ status: "open", result: null }]);
  } finally {
    await deleteUser(a.id);
    await deleteUser(b.id);
  }
});
