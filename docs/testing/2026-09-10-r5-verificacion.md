# R5 — Bellotas y fondos del campamento: verificación de implementación

> **[Evidencia de ejecución · 2026-09-10]**

Spec: `docs/superpowers/specs/2026-09-10-mascota-r5-bellotas-design.md`. Migración
`supabase/migrations/20260911_pet_acorns.sql`. Decisión de sumidero:
`docs/requirements/decisiones.md`, entrada «2026-09-10 — Las bellotas se gastan en
apariencia, no en poder».

## Esquema, contra objetos reales de dev

Verificado contra `information_schema`/`pg_class`/`pg_proc`, no contra el ledger de
migraciones (`list_migrations`):

| Comprobación | Resultado |
|---|---|
| Columnas de `pet_state` | 9 → **10** (`camp_scene` añadida) |
| Grants por columna, `authenticated` | INSERT 7 sin cambio · UPDATE 6 sin cambio · SELECT 9 → 10 |
| `camp_scene` | con SELECT, **sin** UPDATE para `authenticated` — se lee en cliente, no se escribe |
| RLS | activa en `pet_acorn_ledger` y `pet_cosmetics` |
| Funciones presentes | las cinco: `private.pet_acorn_pending`, `public.pet_acorn_state`, `public.claim_pet_acorns`, `public.buy_pet_cosmetic`, `public.set_pet_camp_scene` |
| `claim_pet_acorns` | `authenticated` **no** puede ejecutarla |
| `pet_acorn_state` | `anon` **no** puede ejecutarla |

Detalle completo de tablas, columnas, grants y funciones: `docs/requirements/data-model.md`
§8bis.9.

## Matriz SQL

`supabase/tests/pet_acorns.sql` — doble recogida, compra sin saldo, compra con saldo,
compra repetida, actividad borrada tras recoger y los permisos por rol — ejecutada entera
en dev dentro de una transacción: **PASS, sin fallos** (reejecutado el 2026-09-10 tras
añadir el caso de actividad borrada, mismo resultado). El rollback se confirmó después:
cero filas en `pet_acorn_ledger` y `pet_cosmetics`, cero usuarios de prueba, cero escenas
puestas en `pet_state.camp_scene`.

**La compra concurrente con saldo justo NO está en este fichero.** El bloqueo consultivo
(`pg_advisory_xact_lock(20260910, …)`) solo se nota entre CONEXIONES distintas, y una
transacción SQL es una sola conexión — no hay forma de que esta matriz la ejercite. Esa
prueba vive en `e2e/mascota-tienda-concurrencia.spec.ts`: dos peticiones REST reales en
paralelo (`Promise.all`) contra `buy_pet_cosmetic`, con saldo sembrado justo para UNA
compra y dos cosméticos del mismo precio. Verificado el 2026-09-10, 5 pasadas seguidas sin
fallos: exactamente una compra prospera, la otra falla con `NOT_ENOUGH`, el saldo final
queda en 0 (ni negativo ni doble descuento) y solo el cosmético ganador queda desbloqueado.

## Suite

| Comprobación | Resultado |
|---|---|
| Unitarios `src/lib/pet/shop/` | 18 tests, verde |
| Componentes de mascota y su tienda | 142 tests, verde |
| E2E `mascota-tienda` | verde a 320 px de ancho |
| E2E `mascota-tienda-concurrencia` (compra concurrente con saldo justo) | verde, 5 pasadas seguidas |
| TypeScript | limpio |

## Arte

Cuatro escenas nuevas en `public/pet/scenes/`: `camp-creek` (280×380), `camp-autumn`,
`camp-night`, `camp-snow` (288×384 las tres). 125 generaciones de PixelLab. Procedencia en
`public/pet/scenes/provenance.json`.

## Condición de despliegue obligatoria: `ACORN_EPOCH`

`src/lib/pet/shop/catalog.ts` fija `ACORN_EPOCH = "2026-09-11"`. La regla de la spec
(§3.1) es que esa fecha sea **el día en que la migración `20260911_pet_acorns.sql` llega
a producción**, no la fecha en la que se escribió el código. Nada en el repo ata la
constante a la fecha real del despliegue: es responsabilidad de quien despliega.

**Antes de aplicar esa migración a producción, comprobar `ACORN_EPOCH` contra la fecha
real de ese despliegue y corregirla si no coincide.** Si se deja la fecha vieja y el
despliegue se retrasa, cada día de diferencia regala retroactivamente bellotas por
actividad histórica a las cuentas veteranas — exactamente el agujero que la época existe
para tapar. Esto no se cierra con un test (la fecha correcta depende de cuándo se
despliegue, que no se conoce de antemano): se cierra con esta comprobación manual en el
momento del despliegue. Ver el comentario junto a la constante en `catalog.ts`.

## Qué NO acredita esta evidencia

- **No hay aceptación de producto del ritmo real.** Los criterios de salida de la spec
  (§7: «usar Biblioshare con normalidad lleva al primer fondo en torno a una semana»,
  «recoger tras varios días da lo mismo que recoger a diario», «un fondo nuevo se nota»)
  son de producto, con cuentas reales usando la app. Esta evidencia es SQL, unitarios,
  componentes y un E2E sintético; ninguno de los dos sustituye una semana de uso real, que
  todavía no ha pasado.
- **La migración no está aplicada en producción.** Todo lo de este documento se verificó
  en dev (`biblioshare-dev`). No se ha tocado producción; la sección de esquema de
  `data-model.md` §8bis.9 lo dice explícitamente y no tiene contraparte de prod porque no
  hay nada desplegado que comparar.
- **R4b sigue sin aceptación jugable (#1123).** R5 se construyó sin bloquear en esa
  aceptación, como decidió el usuario para R4b; esta evidencia no cambia el estado de
  #1123 ni afirma que el combate o el botín de R4b estén aceptados.
