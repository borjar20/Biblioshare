import { test, expect, type APIRequestContext } from "@playwright/test";
import { withBattleUsers } from "./support/battle-users";
import { scenePrice } from "../src/lib/pet/shop/catalog";

// R5 (revisión final de rama, hallazgo 1b): `buy_pet_cosmetic` sirve su bloqueo
// consultivo (20260910, migración `supabase/migrations/20260911_pet_acorns.sql`)
// justo para que dos compras a la vez con saldo justo para UNA no descuadren el
// saldo. Eso NO se puede probar dentro de una única transacción SQL: el bloqueo
// solo se nota entre CONEXIONES distintas. Aquí van dos peticiones REST reales
// en paralelo, mismo patrón que el bloque de aventuras de
// `mascota-batallas-autoridad.spec.ts` y la carrera de equipo de
// `mascota-equipo.spec.ts` — contra `service_role`, que es quien la app usa
// (`src/lib/pet/shop/repository.ts`): `buy_pet_cosmetic` no tiene EXECUTE para
// `authenticated`.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

// Dos escenas del MISMO precio: da igual cuál gane la carrera, el saldo
// sembrado (el precio de una) nunca alcanza para las dos.
const SCENE_A = "autumn";
const SCENE_B = "night";
const PRICE = scenePrice(SCENE_A);

async function buy(request: APIRequestContext, userId: string, cosmeticId: string) {
  return request.post(`${url}/rest/v1/rpc/buy_pet_cosmetic`, {
    headers, data: { p_user: userId, p_cosmetic: cosmeticId, p_price: PRICE },
  });
}

async function acornBalance(request: APIRequestContext, userId: string): Promise<number> {
  const res = await request.post(`${url}/rest/v1/rpc/pet_acorn_state`, {
    headers, data: { p_user: userId, p_epoch: "2026-09-11" },
  });
  expect(res.ok()).toBe(true);
  return ((await res.json()) as { balance: number }).balance;
}

test("tienda: compra concurrente con saldo justo para una compra prospera exactamente una vez", async ({ request }) => {
  test.setTimeout(60_000);
  // El reparto del test asume el mismo precio en las dos escenas elegidas.
  expect(scenePrice(SCENE_B)).toBe(PRICE);

  await withBattleUsers(url, key, async (createUser) => {
    const user = await createUser(`r5tconc${Date.now()}`.slice(0, 20));
    // Saldo sembrado directamente, como mascota-tienda.spec.ts: esta prueba
    // mira la carrera de la compra, no la concesión de bellotas. Justo para
    // UNA compra, nunca para las dos.
    expect((await request.post(`${url}/rest/v1/pet_acorn_ledger`, {
      headers, data: { user_id: user.id, source_key: "test:seed", amount: PRICE },
    })).ok()).toBe(true);

    const [ra, rb] = await Promise.all([buy(request, user.id, SCENE_A), buy(request, user.id, SCENE_B)]);
    const results = await Promise.all(
      [ra, rb].map(async (r) => ({ ok: r.ok(), body: (await r.json()) as { bought?: boolean; message?: string } })),
    );

    const succeeded = results.filter((r) => r.ok && r.body.bought === true);
    const failed = results.filter((r) => !r.ok);
    // Exactamente una prospera...
    expect(succeeded).toHaveLength(1);
    // ...y la otra falla por saldo, no por cualquier otro motivo.
    expect(failed).toHaveLength(1);
    expect(failed[0].body.message ?? "").toContain("NOT_ENOUGH");

    // El saldo final es el correcto: ni negativo (doble descuento) ni el
    // precio completo seguiría ahí (compra fantasma que no descuenta).
    expect(await acornBalance(request, user.id)).toBe(0);

    // Solo el cosmético ganador queda desbloqueado, nunca los dos.
    const owned = await request.get(
      `${url}/rest/v1/pet_cosmetics?user_id=eq.${user.id}&select=cosmetic_id`,
      { headers },
    );
    expect(owned.ok()).toBe(true);
    expect(await owned.json()).toHaveLength(1);
  });
});
