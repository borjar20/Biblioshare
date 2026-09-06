# Mascota R1: contratos y modelo de combate (la spec de R2)

> **[Canónico · verificado 2026-09-06]** Contratos del combate de la mascota
> (Parte I §16 de `docs/design/2026-09-06-mascota-rpg-evolucion-por-fases.md`), cerrados
> en el hito R1 con código y tests en `src/lib/pet/battle/`. Es lo que implementa R2.
> Si contradice al código, manda el código; los números mandan en `content.ts`.

## Criterio

El cliente simula, el servidor decide; nada calculado en local cuenta.

Las secciones **1–11 son los once contratos C1–C11**: la sección N es el contrato CN. Así se citan
desde el código (`content.ts`, `record.ts`, `types.ts`) y desde la migración, y así se citan aquí.

---

## 1. Autoridad

El servidor crea el combate (seed, snapshot inmutable, versión, `intent_id`) y lo re-simula desde
seed + inputs; solo de esa re-simulación salen resultado, digest y, en R4, recompensas. El cliente
envía únicamente el log de inputs. `pet_battles` no tiene políticas ni grants de
INSERT/UPDATE/DELETE para `authenticated` ni `anon`; escribe solo `service_role` desde el servidor.
Ninguna RPC accesible al cliente inserta combates (#1081 R1).

Lo comprueba desde fuera `e2e/mascota-batallas-autoridad.spec.ts` contra PostgREST: con un JWT
normal, insertar da 403 (`42501`), editar la fila propia da 403 (`42501`), borrarla da 403; otra
cuenta lee `[]` e insertar en su nombre da 403; anónimo da 401/403. La fila sigue `open` con
`result: null` después de todos los intentos.

## 2. Seed y PRNG

Seed = 32 caracteres hex en minúsculas (128 bits), generado por el servidor; se rechaza el seed
todo ceros. PRNG xoshiro128\*\* con estado = las cuatro palabras big-endian del seed.

Tiradas: `nextU32`, `nextInt(lo, hi)` = `lo + u32 % (hi − lo + 1)` (módulo directo, normativo, con
el sesgo que eso implica: es parte del contrato, no un descuido), `nextBp` = `u32 % 10000`.

**Orden de consumo** (cambiarlo cambia todos los combates ya guardados):

1. Tirada 1 en `createBattle`: la duración del reposo inicial del enemigo.
2. Después, en cada transición del enemigo: **al entrar en reposo**, una tirada
   `nextInt(idleMin, idleMax)`; **al salir del reposo**, una tirada `nextBp` (carga si
   `< chargeBp`, guardia si no).

Añadir una tirada exige subir `RULESET.version`. Sub-flujos (minijuegos): `subStream(seed,
etiqueta, tick)` — deriva un estado propio y **no toca el flujo principal**.

`seedFromIndex(i)` da seeds válidos, distintos y estables: es lo que usan la calibración y el CLI
para que una tabla de 200 seeds sea reproducible.

## 3. Reloj

`tickMs = 100`; `maxTicks = 600` (60 s); segundos = `ticks × tickMs / 1000`. Los cooldowns cuentan
**ticks de simulación**: pausar no avanza ticks, así que pausar no recarga la habilidad.

## 4. Log de inputs

Lista de `{ seq, tick, action, payload }`:

- `seq` = índice (0, 1, 2…), contiguo desde 0.
- `tick` entero en `[0, maxTicks]`, **no decreciente**.
- `action ∈ {"skill"}` en R2.
- `payload` objeto plano con valores enteros o cadenas (`{}` en R2).
- Máximo **64** inputs (`RULESET.maxInputs`).

Todo input debe caer en un tick simulado: un input posterior al fin del combate invalida el log
(`INPUTS_AFTER_END`). Dos inputs en el mismo tick se procesan en orden de `seq`.

`validateInputs(raw, ruleset)` es el único camino de entrada al motor en el servidor: devuelve
**copias** tipadas (el objeto del cliente nunca entra en la simulación) y, si falla, un **código**
—no un texto— de `NOT_ARRAY`, `TOO_MANY`, `BAD_SHAPE`, `BAD_SEQ`, `BAD_TICK`, `TICK_ORDER`,
`BAD_ACTION`, `BAD_PAYLOAD`, con el `index` del input culpable.

## 5. Orden de resolución de un tick T

`stepBattle(ctx, st, inputs)` resuelve el tick T en este orden:

0. En T = 0, `BATTLE_STARTED`.
1. **Transiciones del enemigo** cuyo `phaseUntil === T` — primero expiran/resuelven (carga que
   aterriza, guardia que termina, aturdimiento que expira → reposo), y un reposo que termina elige
   anuncio.
2. **Inputs de T** en orden de `seq`.
3. **Básica de la mascota** si `T === nextBasic`.
4. **Básica del enemigo** si está en reposo y `T === nextBasic`.
5. Si `T === maxTicks`, fin por límite.

Un KO **termina el tick en el acto**: nada posterior se procesa. El daño registrado en un evento es
el **efectivo** (acotado a la vida restante): la vida nunca es negativa.

Eventos (`BattleEvent`): `BATTLE_STARTED`, `PET_BASIC`, `ENEMY_BASIC`, `TELEGRAPH_STARTED`,
`TELEGRAPH_RESOLVED`, `SKILL_USED`, `SKILL_IGNORED`, `STATUS_APPLIED`, `STATUS_EXPIRED`,
`BATTLE_ENDED`. Todos llevan `seq` contiguo y `tick` no decreciente, y la lista siempre termina en
`BATTLE_ENDED`.

Lo que el cliente sabe legítimamente en cada tick es `viewOf(st)` → `BattleView` (`tick`, vidas y
máximos, `enemyPhase`, `enemyPhaseUntil`, `skillReadyAt`, `ended`). Es lo que alimenta la UI de R2
y lo único que ven las políticas del simulador: si una política necesitara más, la UI también, y
entonces sería información que el jugador no tiene.

## 6. Kit genérico de R2

**Mascota** (`RULESET.pet`):

- Básica cada **15** ticks, daño `atk`.
- Habilidad «pulsar ahora» con cooldown **60** ticks:
  - durante la **carga** del enemigo (`windup`) la interrumpe y hace `4 × atk`; el enemigo queda
    aturdido **20** ticks (`staggerTicks`);
  - durante la **guardia** se desperdicia (0 daño) y el enemigo castiga con el **25 %** de la vida
    máxima de la mascota;
  - en reposo o aturdimiento hace `2 × atk`.
  - Con cooldown: `SKILL_IGNORED` (`reason: "cooldown"`), sin gastar nada.

**Enemigo «Brote de zarza»** (`BROTE`):

- Vida `42 × atk` de la mascota.
- En reposo (**20–40** ticks) pega cada **20** ticks el **4 %** de la vida máxima de la mascota.
- Anuncia con probabilidad **50/50** (`chargeBp: 5000`) una **carga** (15 ticks; si aterriza, 40 %
  de la vida máxima) o una **guardia** (25 ticks; las básicas de la mascota hacen
  `max(1, floor(atk / 4))`).

**Ventana de interrupción:** ticks `[inicio, resolvesAt − 1]`. Un input **en** `resolvesAt` llega
tarde: la carga aterriza y la habilidad pega como en reposo.

> **El cooldown lo movió la calibración, no el diseño.** El contrato de partida decía 90 ticks
> (`r2.1`). Con 90, `interrupt` ganaba solo el **40 %** —y el 55–57 % con 70—, porque el ciclo del
> enemigo (reposo + veredicto) mide 50–100 ticks: con un cooldown más largo que el ciclo, el
> anuncio siguiente a cada pulsación cae en cooldown y tiene un 50 % de ser una carga que aterriza
> entera (40 % de la vida). El patrón de todas las derrotas era el mismo, `chargesLanded: 2`.
> Bajando de 10 en 10, **60** es el primer valor que pasa los umbrales (87–88 %). No hizo falta
> tocar `hpPerAtk`, `chargePct`, `punishPct` ni `skillIdleMul`. La versión resultante es
> **`RULESET.version = "r2.2"`**.

## 7. Poder de combate

`combatPower = Σ` de los seis atributos **sin bonus de clase**; `tier = levelFor(combatPower)`
(misma curva que el nivel, sobre otra magnitud; **no es el nivel visible y no se guarda**:
viaja dentro del snapshot de cada combate).

`hpMax = 100 + 10 × tier`, `atk = 8 + 2 × tier`.

En R2 la clase **no altera stats** (identidad de clase = R6): dos mascotas con los mismos atributos
y distinta clase tienen el mismo tramo y las mismas stats, aunque su nivel visible difiera. Los
seis perfiles sintéticos comprueban que la decisión correcta gana en todos los tramos (#1081 R6).

**Calibración** (`src/lib/pet/battle/calibration.ts`): una celda = perfil × clase × política sobre
N seeds reproducibles (`seedFromIndex`), agregada por política × perfil (las seis clases son
idénticas en R2 y solo dispersarían). Umbrales (`CALIBRATION`), que son los criterios de salida de
R2 en números: `interrupt ≥ 85 %`, `spam ≤ 35 %`, `never ≤ 5 %`, media de ticks de `interrupt` en
`[300, 560]`. Si la decisión correcta no gana o pulsar a ciegas gana, **el contenido está mal, no
el test**.

Tabla con el contenido final (`npm run pet:battle -- calibrate --seeds 40`; la misma matriz que
corre `calibration.test.ts`, 6 perfiles × 6 clases × 3 políticas × 40 seeds = 4 320 combates):

```
seeds por celda: 40
política      perfil           victorias  media ticks
never         nueva                  0 %          247
spam          nueva                  3 %          243
interrupt     nueva                 88 %          468
never         importadora            0 %          247
spam          importadora            3 %          243
interrupt     importadora           88 %          464
never         cinefila               0 %          227
spam          cinefila               3 %          237
interrupt     cinefila              88 %          461
never         social                 0 %          227
spam          social                 3 %          237
interrupt     social                88 %          461
never         lectora_larga          0 %          247
spam          lectora_larga          3 %          243
interrupt     lectora_larga         88 %          466
never         seriefila              0 %          247
spam          seriefila              3 %          243
interrupt     seriefila             88 %          464
✓ calibración dentro de umbrales
```

Con los 200 seeds por celda del CLI (`CALIBRATION.seeds`, el valor por defecto de `calibrate`)
`interrupt` sube al **94 %** en los seis perfiles, con medias de 476–480 ticks: 60 no es un valor
al filo del umbral, el margen crece al mirar más seeds.

Las tres políticas del simulador (`policies.ts`) son la lectura del contrato: `never` no pulsa
nunca, `spam` pulsa en cuanto puede, `interrupt` pulsa solo durante la carga. Lo que graba una
política se re-simula igual: **el log ES el estado**.

## 8. Fin y resultado

KO del que llega a 0. En el límite gana quien conserve **mayor fracción de vida**
(`petHp × enemyHpMax` frente a `enemyHp × petHpMax`, comparación entera sin división); empate =
`draw`.

`BattleResult` lleva `outcome` (`win`/`lose`/`draw`), `reason` (`ko`/`limit`), `ticks`, `petHp`,
`petHpMax`, `enemyHp`, `enemyHpMax`, `damageDealt`, `damageTaken` y hasta **dos** `causes`:

- victoria: `charges_interrupted` o `steady_damage`;
- derrota: `skill_unused` si nunca se pulsó y aterrizó alguna carga; después `charges_landed` /
  `skill_wasted_on_guard` por daño; y `time_limit`.

Las causas son el «resultado legible» de R2: no hay que interpretar el log de eventos para contar
por qué se perdió.

## 9. Canónico y digest

`canonicalJson`: claves ordenadas por **code units**, sin espacios, **solo enteros seguros**, sin
`undefined` (lanza en vez de omitir; un valor no entero o no JSON es un error, no un campo que
desaparece).

```
digest = sha256(canonicalJson({ rulesetVersion, contentHash, enemyId, seed, snapshot, inputs, events, result }))
```

en hex. Los `events` son **los re-simulados** y el material **NO contiene el digest**: sin
circularidad por construcción (#1081 R5).

`contentHash = sha256(canonicalJson({ ruleset, enemies }))`: fija con qué números se simuló. Está
clavado en `content.test.ts`, así que tocar un número de `content.ts` rompe el test — que es
justamente el recordatorio de subir `RULESET.version` y regenerar el ejemplo normativo.

**Reproducir eventos guardados no sustituye a re-simular: la BD no guarda eventos.**

`resimulate(record, content)` es lo que hace el servidor en R2 y el CLI en `replay`. Devuelve
`{ ok: true, events, result, digest }` o un código: `UNKNOWN_ENEMY`, `RULESET_MISMATCH`,
`CONTENT_MISMATCH`, `INVALID_SEED`, `INVALID_INPUTS`, `INPUTS_AFTER_END`, `RESULT_MISMATCH`. La
búsqueda del enemigo usa `Object.hasOwn` (una clave del cliente no puede llegar a `__proto__`), y
un `result` que ni siquiera es canonizable se rechaza como `RESULT_MISMATCH` en vez de lanzar.

## 10. Identificador por intención

`intent_id` (uuid v4 generado **por el cliente** por cada intención de combatir) con
`unique (user_id, intent_id)`: un reintento con el mismo `intent_id` recupera el combate en vez de
crear otro. El identificador **no** da al cliente autoridad sobre seed ni resultado (#1081 R4).

Flujo en R2:

```
startBattle(intentId)  → fila `open` (seed, snapshot, ruleset_version, content_hash)
   ↓ el cliente simula con el mismo motor
resolveBattle(intentId, inputs)
   → validateInputs → resimulate → escribe inputs, result, digest, resolved_at, status = "resolved"
```

## 11. Minijuego (para R3)

`minigameInstance(seed, tick, familia)` deriva la instancia de `subStream(seed, "ulti:" + familia,
tick)`: `k ≤ 4` fichas, `tokens` en el orden mostrado y `solution` (ficha → hueco). El servidor la
**regenera** y puntúa la asignación enviada con `scoreAssignment`; **el cliente nunca envía una
puntuación**. Está en R1 para que R3 no tenga que inventar otro flujo de aleatoriedad derivada.

---

## 12. Ejemplo normativo

Congelado en `src/lib/pet/battle/__fixtures__/normative.json` y regenerable con
`npm run pet:battle -- golden`. Es el ejemplo completo que pide el criterio de salida de R1: seed →
inputs → eventos → bytes del hash → resultado.

**Seed** `5e2d177214e498f0d20ea1fdb382f339` (`seedIndex: 1`, es decir `seedFromIndex(1)`).
**Contenido** `rulesetVersion: "r2.2"`,
`contentHash: 2c40a90c9f141ffd2eda8241c83eb8859a712dbe4606798b56b90fb056b159d3`,
`enemyId: "brote"`.

**Snapshot** (perfil `lectora_larga`, clase `wizard`):

| campo | valor |
|---|---|
| `name` | `Lectora de libros largos` |
| `petClass` | `wizard` |
| `stage` | `adult` |
| `attributes` | `FUE 400, CON 1120, INT 390, SAB 290, CAR 21, DES 90` |
| `tier` | `13` |
| `hpMax` | `230` |
| `atk` | `34` |

Enemigo: `hpMax = 42 × 34 = 1428`.

**Inputs** (los cuatro, completos):

```json
[
  { "seq": 0, "tick": 22,  "action": "skill", "payload": {} },
  { "seq": 1, "tick": 137, "action": "skill", "payload": {} },
  { "seq": 2, "tick": 197, "action": "skill", "payload": {} },
  { "seq": 3, "tick": 362, "action": "skill", "payload": {} }
]
```

**Eventos** — 65 en total; los doce primeros y el último:

```json
{"seq":0,"tick":0,"type":"BATTLE_STARTED","petHp":230,"enemyHp":1428}
{"seq":1,"tick":15,"type":"PET_BASIC","damage":34,"enemyHp":1394,"guarded":false}
{"seq":2,"tick":20,"type":"ENEMY_BASIC","damage":9,"petHp":221}
{"seq":3,"tick":21,"type":"TELEGRAPH_STARTED","kind":"charge","resolvesAt":36}
{"seq":4,"tick":22,"type":"SKILL_USED","effect":"interrupt","damage":136,"enemyHp":1258,"petHp":221}
{"seq":5,"tick":22,"type":"STATUS_APPLIED","status":"stagger","until":42}
{"seq":6,"tick":30,"type":"PET_BASIC","damage":34,"enemyHp":1224,"guarded":false}
{"seq":7,"tick":42,"type":"STATUS_EXPIRED","status":"stagger"}
{"seq":8,"tick":45,"type":"PET_BASIC","damage":34,"enemyHp":1190,"guarded":false}
{"seq":9,"tick":60,"type":"PET_BASIC","damage":34,"enemyHp":1156,"guarded":false}
{"seq":10,"tick":62,"type":"ENEMY_BASIC","damage":9,"petHp":212}
{"seq":11,"tick":75,"type":"PET_BASIC","damage":34,"enemyHp":1122,"guarded":false}
...
{"seq":64,"tick":450,"type":"BATTLE_ENDED","outcome":"win","reason":"ko","petHp":57,"enemyHp":0}
```

Se lee entero el contrato en los seis primeros eventos: la básica de la mascota cae en el tick 15
(`basicInterval`), el enemigo pega 9 = `floor(4 % × 230)`, anuncia carga en el 21 con
`resolvesAt: 36`, y el input del tick 22 —dentro de la ventana `[21, 35]`— la interrumpe con
`136 = 4 × 34` y le aplica `stagger` hasta el 42 (`22 + 20`).

**Resultado:**

```json
{
  "outcome": "win", "reason": "ko", "ticks": 450,
  "petHp": 57, "petHpMax": 230, "enemyHp": 0, "enemyHpMax": 1428,
  "damageDealt": 1428, "damageTaken": 173,
  "causes": ["charges_interrupted"]
}
```

**Bytes del hash.** `canonicalLength: 5961` y `canonicalHead` son `material.length` y
`material.slice(0, 240)` **sobre la cadena** (unidades de código UTF-16), que es lo que compara
`normative.test.ts` — no la longitud en bytes de su codificación. Aquí coinciden porque este
material es ASCII puro; con un nombre de mascota acentuado no coincidirían. Los primeros 240,
verbatim:

```
{"contentHash":"2c40a90c9f141ffd2eda8241c83eb8859a712dbe4606798b56b90fb056b159d3","enemyId":"brote","events":[{"enemyHp":1428,"petHp":230,"seq":0,"tick":0,"type":"BATTLE_STARTED"},{"damage":34,"enemyHp":1394,"guarded":false,"seq":1,"tick":1
```

Se ve el contrato de §9 en los propios bytes: claves ordenadas (`contentHash` antes de `enemyId`
antes de `events`; dentro de un evento, `damage`, `enemyHp`, `guarded`, `seq`, `tick`, `type`), sin
un solo espacio, y `events` **antes** que `inputs`, `result`, `ruleset...`, `seed`, `snapshot`
porque el orden es alfabético por code units, no el de escritura.

**Digest:** `f6ce51cc44715bc87b317ae1d5fc49fc8f04df904d5fdcf3d85d15cf3310ac8a`.

> El material del hash es `canonicalJson({ rulesetVersion, contentHash, enemyId, seed, snapshot,
> inputs, events, result })`; no contiene el digest. `normative.test.ts` lo recalcula.

`normative.test.ts` comprueba cuatro cosas sobre este fixture: que el `contentHash` guardado es el
del contenido de hoy (si falla, hay que regenerar con `pet:battle golden` y **subir
`RULESET.version`**), que re-simular reproduce exactamente eventos, resultado y digest, que los
bytes del hash empiezan como dice esta sección, y que el ejemplo enseña **las dos decisiones**:
interrumpe la primera carga y espera la primera guardia.

---

## 13. Datos

`supabase/migrations/20260907_pet_battles.sql`. Un combate es un **hecho**: lo que se guardó al
crearlo y lo que salió de re-simularlo. **Los eventos no se guardan.**

| Columna | Tipo | Qué es |
|---|---|---|
| `id` | `uuid pk default gen_random_uuid()` | identidad de la fila |
| `user_id` | `uuid not null → auth.users on delete cascade` | dueño; es la columna de la política |
| `intent_id` | `uuid not null` | la **intención** de combatir del cliente (C10); con `unique (user_id, intent_id)` hace idempotente el reintento |
| `kind` | `text not null default 'training'` | `training` hoy; **sin CHECK** a propósito: R4 añade `adventure` sin migración de tipo |
| `enemy_id` | `text not null` | clave en `ENEMIES` (`brote`) |
| `ruleset_version` | `text not null` | con qué reglas se simuló (`r2.2`) |
| `content_hash` | `text not null check ~ '^[0-9a-f]{64}$'` | con qué **números** se simuló (C9) |
| `seed` | `text not null check ~ '^[0-9a-f]{32}$'` | los 128 bits del servidor (C2) |
| `snapshot` | `jsonb not null` | la foto inmutable de la mascota (C7): incluye el `tier`, que no se guarda en ningún otro sitio |
| `status` | `text not null default 'open' check in ('open','resolved')` | ciclo de vida |
| `inputs` | `jsonb` | el log `(seq, tick, action, payload)` **validado** (C4) |
| `result` | `jsonb` | el `BattleResult` **re-simulado** (C8) |
| `digest` | `text check ~ '^[0-9a-f]{64}$'` | sha256 del registro + eventos re-simulados (C9) |
| `created_at` | `timestamptz not null default now()` | |
| `resolved_at` | `timestamptz` | |

Dos restricciones más:

- `unique (user_id, intent_id)` — la idempotencia de C10, en el esquema y no en el código.
- Un CHECK de coherencia de estado: `open` = `inputs`, `result`, `digest` y `resolved_at` **todos
  nulos**; `resolved` = los cuatro **no nulos**. No existe una fila a medio resolver.

Índice: `pet_battles_user_created_idx (user_id, created_at desc)` — el historial del dueño.

**RLS y grants.** RLS activa, **una** política: `select` propio para `authenticated`
(`(select auth.uid()) = user_id`). El cliente **necesita** leer: sin `seed` y `snapshot` no puede
simular en vivo. **Sin** insert/update/delete para `authenticated` ni `anon`
(`revoke all … ; grant select on … to authenticated`): escribe solo el servidor con `service_role`
tras re-simular (C1). `service_role` no pasa por RLS, así que no necesita política.

Como `pet_nudges`, esta tabla **no aparece en la superficie 6 de `docs/DRIFT-CHECK.md`** (esa
superficie solo mira tablas donde `authenticated` tiene algún grant de escritura). Su control es
esta sección más el e2e.

**Verificación en dev (2026-09-06)** contra objetos reales (`pg_class`, `pg_policies`,
`has_table_privilege`), nunca contra `list_migrations`:

```
true | 1 | true | false | false | false | false | true | 1
```

= RLS activa · 1 política · `authenticated` select **sí** · insert **no** · update **no** ·
delete **no** · `anon` select **no** · `service_role` insert **sí** · 1 índice.
**Prod: pendiente hasta mergear** la rama `feat/mascota-r1-contratos`.

**Flujo de R2 (C10), sin `use cache`.** Todo lo que toca combates depende de la sesión (regla
#437): nada de esto se cachea.

1. `startBattle(intentId)` — si ya existe `(user_id, intent_id)`, la devuelve; si no, inserta
   `open` con seed nuevo, snapshot, `ruleset_version` y `content_hash`.
2. El cliente simula con el mismo motor y va grabando el log de inputs.
3. `resolveBattle(intentId, inputs)` — si la fila ya está `resolved`, devuelve lo guardado;
   si no: `validateInputs` → `resimulate` → escribe `inputs`, `result`, `digest`, `resolved_at`,
   `status = 'resolved'`.

---

## 14. Qué implementa R2 con esto

Lista cerrada. R2 **no diseña**: implementa.

- **Server action `startBattle(intentId)`** — cliente de `service_role`; snapshot desde
  `getPetSnapshot` pasado por `buildSnapshot` (atributos crudos → `tier`, `hpMax`, `atk`); seed con
  `crypto.getRandomValues` (32 hex en minúsculas, rechazando el todo ceros); **idempotente por
  `intent_id`**.
- **Server action `resolveBattle(intentId, inputs)`** — recupera si ya está resuelto; valida el log
  (`validateInputs`); re-simula (`resimulate`); persiste `inputs`, `result` y `digest`. Devuelve el
  código de error tal cual cuando falla: el cliente no reintenta a ciegas.
- **Página de entrenamiento en `/mascota`** — el motor en cliente (`createBattle` + `stepBattle` +
  `viewOf`), con **pausa** y **control de velocidad** (ninguno de los dos avanza ticks: §3).
  Sin recompensa, sin consumo, repetible.
- **Resultado legible** — `result.causes` en texto; el log de eventos como detalle plegado.
- **Replay** — desde los eventos **re-simulados**, no desde eventos guardados (§9).

**Criterios de salida de R2:** los de la Parte II del documento de diseño (repetir sigue siendo
interesante después de veinte; guardar la habilidad es a veces mejor que pulsarla y se descubre
solo; cambiar la decisión cambia el resultado y se entiende por qué se perdió; el replay reproduce
exactamente y el servidor rechaza logs manipulados).

---

## 15. Pruebas

14 ficheros bajo `src/lib/pet/battle/`, 71 tests (la suite de mascota entera: 165).

| Fichero | Qué fija |
|---|---|
| `prng.test.ts` | el seed se parte en cuatro palabras big-endian; la primera tirada del seed de referencia; rangos de `nextInt`/`nextBp`; `subStream` no toca el flujo principal; `seedFromIndex` es estable |
| `canonical.test.ts` | orden por code units, sin espacios, solo enteros seguros; `undefined` y los tipos no JSON **lanzan** en vez de omitirse; escapado de cadenas |
| `hash.test.ts` | `sha256Hex` contra vectores conocidos |
| `content.test.ts` | todos los números son enteros, el anuncio es 50/50, y el `contentHash` está **clavado**: tocar un número rompe este test |
| `power.test.ts` | `combatPower` suma los seis atributos **sin bonus de clase**; el nivel visible sí depende de la clase y el tramo no (#1081 R6); las stats crecen con el tramo y el enemigo escala con la mascota |
| `profiles.test.ts` | los seis perfiles cubren el rango de tramos; el tope de la dote de historial impide que la importadora domine por volumen; la clase cambia el nombre de la ficha, no el tramo |
| `inputs.test.ts` | un log bien formado se acepta y se **copia**; el vacío es válido; el payload se copia en un objeto nuevo (y cada forma inválida da su código) |
| `engine.test.ts` | el orden de resolución de §5 caso a caso: primera básica en el 15; determinismo sobre 50 seeds; `seq` contiguos, ticks no decrecientes, vida nunca negativa, siempre `BATTLE_ENDED`; interrupción (4×atk + stagger 20) frente a un input **en** `resolvesAt` que llega tarde; guardia (habilidad desperdiciada + castigo, básicas a un cuarto); cooldown (dos inputs en el mismo tick → el segundo se ignora; listo justo en `readyAt`); fin por límite y empate |
| `policies.test.ts` | `never` coincide con `simulate([])`; lo que graba una política se re-simula igual (**el log ES el estado**); `interrupt` solo pulsa durante la carga y su victoria trae `charges_interrupted`; `spam` empieza en el tick 0, nunca provoca `SKILL_IGNORED` y cabe en `maxInputs` |
| `calibration.test.ts` | la matriz de §7: interrumpir gana, pulsar a ciegas pierde, no pulsar pierde, y la duración cae en rango. **Es el criterio de salida de R2 en números** |
| `record.test.ts` | el digest es hex de 64, estable, y su material **no contiene ningún digest**; cambia si cambia un input, el seed o el resultado; `resimulate` acepta el registro honesto y rechaza una victoria fabricada, un resultado retocado, enemigo/versión/hash/seed/inputs inválidos con su código, un input posterior al final, y un `result` no canónico (sin lanzar) |
| `minigame.test.ts` | misma `(seed, tick, familia)` → misma instancia; `tokens` y `solution` son permutaciones de `0..k−1` con `k` entre 2 y 4; `scoreAssignment` puntúa en servidor (la asignación viaja, la puntuación no) |
| `normative.test.ts` | el ejemplo de §12: es del contenido de hoy, re-simular lo reproduce exactamente, los bytes del hash empiezan como dice la spec, y enseña las dos decisiones |
| `purity.test.ts` | ningún módulo del motor (≥ 13 ficheros, sin contar tests) contiene `Math.random`, `new Date(`, `Date.now`, `process.env` ni importa `@supabase/`, `react` o `next` |

**e2e:** `e2e/mascota-batallas-autoridad.spec.ts` (fixture `request` de Playwright, sin navegador)
ataca PostgREST con un JWT real: insertar, editar y borrar dan 403; otra cuenta no ve nada ni puede
insertar en tu nombre; anónimo 401/403; y la fila sigue `open` con `result: null` al terminar. Es
el criterio de salida «un JWT normal que intenta fabricar una victoria es rechazado; otra cuenta,
también».

**Cómo correr el CLI** (`scripts/pet-battle/simulate.ts`, Node 22, sin red ni Supabase):

```bash
npm run pet:battle -- run [--seed <32 hex>] [--profile lectora_larga] [--class wizard] [--policy interrupt] [--events] [--json]
npm run pet:battle -- calibrate [--seeds 200]
npm run pet:battle -- replay <fichero.json>   # salida de `run --json` o un registro de pet_battles
npm run pet:battle -- golden                  # reescribe __fixtures__/normative.json
```

`replay` imprime `✓ coincide` con exit 0 si el registro es honesto, y el código de `resimulate`
(p. ej. `re-simulación rechazada: RESULT_MISMATCH`) con exit 1 si no. Es la misma llamada que hará
el servidor en R2.

---

## 16. Límites asumidos

- **El seed es legible por el dueño** (le hace falta para simular): un cliente modificado puede
  precalcular el momento óptimo de pulsar. Solo importa en PvP y rankings, que están fuera del
  roadmap activo (§16.2 de la Parte I). El servidor sigue decidiendo el resultado; lo que no
  impide es que alguien juegue perfecto.
- **Los eventos no se guardan**: el replay re-simula (§9). Un cambio de contenido invalida el
  replay de los combates viejos —de ahí que `ruleset_version` y `content_hash` viajen con cada
  fila: se sabe cuáles ya no se pueden reproducir.
- **`kind` es texto sin CHECK**: R4 añade `'adventure'` sin migración de tipo. A cambio, nada
  impide escribir un `kind` inventado; solo escribe el servidor, así que el control es el código.
- **El tramo de poder no se guarda**: viaja en el snapshot de cada combate. Consultar «qué tramo
  tenía en junio» significa leer combates, no una columna.
