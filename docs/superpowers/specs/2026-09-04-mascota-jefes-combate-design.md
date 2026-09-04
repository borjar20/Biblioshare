# Mascota fase 4: jefes de reto y motor de combate (autobattler tipo El Bruto)

> **[Histórico · congelado 2026-09-04 · APARCADA]** Spec de diseño de la fase 4 (#1015). Sale del
> brainstorming del 2026-09-04 con el dueño del proyecto (decisiones en §1) y del GDD de referencia
> `docs/reference/2026-09-02-arena-zero-gdd.md` (Arena Zero, fórmula El Bruto). **Se cerró sin
> presentar el diseño sección a sección**: lo marcado «propuesto» en §11 no está validado y hay que
> repasarlo al retomar, antes de escribir el plan. Congelada como historia; el estado de hoy manda
> en el código y en la canónica de arte (`2026-09-03-mascota-arte-pixellab-design.md`).

## Criterio

Los de la spec RPG (`2026-09-02-mascota-rpg-design.md`) siguen mandando: **espejo, no máquina de
culpa** (los combates se ganan leyendo, no pulsando), **todo lo derivable se deriva; solo se guarda
lo que es una decisión** (aquí: la actitud elegida y el resultado inmutable de cada combate), la
mascota **nunca pierde nada** (un jefe que escapa no castiga). A eso se suma la regla del GDD que
adoptamos entera: **servidor autoritativo y combate determinista** — el cliente recibe una lista de
eventos y solo la reproduce; nunca decide ganador, daño ni recompensa. Y la de Play: la animación
es teatro hacia un resultado ya emitido.

## 1. Decisiones del brainstorming (2026-09-04)

| Pregunta | Decisión |
|---|---|
| Jugabilidad | Fórmula **El Bruto**: autobattle observado, pocas decisiones de alto impacto, replay por eventos (GDD Arena Zero como referencia; nada suyo se copia literal) |
| Alcance de la fase 4 | **Motor + jefes de reto, sin destino** (ni armas, ni habilidades por nivel, ni compañeros). El motor nace **simétrico** (dos snapshots) para que el PvP (#1016) solo añada emparejamiento y rating |
| Intentos de combate | **Ganados leyendo: 1 por obra terminada** que cuente para el reto dentro de su ventana. El jefe **conserva el daño** entre combates (raid) |
| Disparo | **Intento pendiente que lanza el usuario** desde `/mascota`, eligiendo **actitud** (ofensiva / equilibrada / defensiva): la única decisión, se guarda con el combate |
| El jefe | **Una criatura por tipo de reto**: libro, serie, película, cualquiera (arte PixelLab nuevo). Stats derivados del reto |
| Recompensa | **Celebración + familia de logros «jefes», sin XP** (la XP solo sale de leer). Ventana cerrada con el jefe vivo = «escapó», sin castigo, queda en el historial |
| Animaciones | **Nuevas** (`attack`, `hit`, `ko` y un idle de combate), sobre los 18 estados existentes |
| Vista de combate | **Perfil, B invertida** (mockup del companion visual): **mascota a la izquierda mirando `east`**, rival a la derecha mirando `west`. Las animaciones de combate de la mascota se generan en `east`; los jefes en `west` |
| Rival PvP | **Espejado**: `east` volteado por CSS (`scaleX(-1)`); el arco/espada cambian de mano y se acepta. Generar `west` queda para cuando el PvP lo pida (#1016) |
| Arquitectura | **Opción 1**: motor puro en servidor, jefe **derivado** de las batallas guardadas (sin tabla de jefes) |

## 2. Alcance

**Dentro:** motor determinista (`src/lib/pet/battle/`), snapshot de combate de la mascota,
jefe derivado del reto, intentos derivados, server action de combate, tabla `pet_battles`,
sección «Jefes» en `/mascota` con replay, historial, celebración y logros, animaciones de combate
de los 18 estados y las 4 criaturas, simulador de balance por CLI, tests de determinismo.

**Fuera (issues al cerrar la spec):** destino por nivel (armas/habilidades/compañeros), PvP y
rating (#1016), género del criterio → perfil del jefe, dirección `west` generada para rivales,
cosméticos (#1017), BiblioPlay como fuente (#1018), retos de club (`criteria_challenge`), avisos
push de intento pendiente (la compañera lo enseña pasivamente; sin push, coherente con #1047).

## 3. El luchador: snapshot de la mascota

Un combate recibe dos `FighterSnapshot` inmutables. El de la mascota se construye en servidor
desde `getPetSnapshot` (atributos, nivel, clase) en el momento de lanzar el combate; se guarda tal
cual en `pet_battles` para que el replay sea reproducible aunque la mascota cambie después.

```ts
type FighterSnapshot = {
  id: string;                 // "pet:<user_id>" | "boss:<challenge_id>"
  name: string;
  kind: "pet" | "boss";
  level: number;
  // Stats de combate ya normalizados (§3.1), no los atributos crudos.
  stats: { hp: number; str: number; agi: number; spd: number; arm: number; mor: number };
  personality: PetClass | BossKind;  // pesos de IA (§4.3)
  technique: TechniqueId;            // una por clase / por jefe (§4.4)
  sprite: { stage: PetStage; cls: PetClass } | { boss: BossKind };  // solo para pintar
  contentHash: string;               // hash del contenido de reglas que le aplica
};
```

### 3.1 De atributos a stats (propuesto, §11)

Los seis atributos crecen sin tope (cientos o miles); el combate quiere rangos cortos y legibles.
Cada atributo se aplasta con la misma función y va a un papel de combate:

| Atributo | Stat | Papel en el motor |
|---|---|---|
| **CON** | `hp` (vigor) | vida máxima: `MAX_HP = 80 + 12·hp + 3·(level−1)` |
| **FUE** | `str` | daño base de ataque y de la técnica |
| **DES** | `agi` | precisión, evasión y crítico |
| **INT** | `spd` | velocidad: intervalo entre acciones |
| **SAB** | `arm` | armadura (mitigación) y probabilidad de bloqueo |
| **CAR** | `mor` (moral) | iniciativa y multiplicador de crítico |

`stat = 3 + floor(sqrt(max(0, attr) / BALANCE.battle.attrDivisor))`, con `attrDivisor = 10`: un
atributo de 90 da 6, uno de 1 000 da 13, uno de 10 000 da 34. Sin tope: la mascota más leída pega
más, y el jefe escala con el nivel (§5.2) para que no sea un paseo. Los números viven en
`BALANCE.battle` y se calibran con el simulador (§9), nunca a ojo.

La clase **no** multiplica stats en combate (ya multiplica la XP): fija la **personalidad** (pesos
de la IA, §4.3) y la **técnica** (§4.4). Es lo que la spec RPG §2 prometía («fija aspecto y, en
fase de combate, jugadas»).

### 3.2 Actitud

Elegida por el usuario al lanzar; es la única decisión y se guarda.

| Actitud | Efecto |
|---|---|
| Ofensiva | +10 % daño causado, −8 % mitigación |
| Equilibrada | sin modificador |
| Defensiva | +10 % mitigación, −8 % daño causado |

El jefe combate siempre en equilibrada.

## 4. Motor de combate (`src/lib/pet/battle/`)

Paquete **puro**: sin Supabase, sin `Date`, sin `Math.random`, sin variables de entorno, sin
React. Mismo criterio que `derive.ts`: quien lo llama trae todo. Se prueba entero en vitest y se
ejecuta por CLI (§9).

```ts
simulateBattle({
  battleId, rulesetVersion, seed,   // seed: 128 bits que fija el servidor (§6)
  a: FighterSnapshot, b: FighterSnapshot,
  attitudeA: Attitude, attitudeB: Attitude,
}): { winner: "a" | "b" | "draw"; outcome: "ko" | "limit"; durationTicks: number;
      damageToA: number; damageToB: number; events: BattleEvent[]; checksum: string }
```

### 4.1 PRNG y determinismo

`xoshiro128**` propio (`prng.ts`), estado serializable, vectores de prueba fijos. Cada consumo
está en un orden documentado; añadir una tirada nueva exige subir `rulesetVersion`. Toda
probabilidad se compara como entero en 0..10 000 (nada de coma flotante en decisiones).
`checksum` = sha256 de (`rulesetVersion`, seed, snapshots, actitudes, eventos): dos simulaciones
con la misma entrada dan el mismo checksum; el test lo comprueba 1 000 veces.

### 4.2 Reloj de acciones

Igual que el GDD §6.3: cada luchador tiene `nextAction`; actúa el de menor valor (empate: tirada);
la acción elegida añade su intervalo. Límite: 120 acciones o 1 800 ticks. Iniciativa inicial:
tirada 0..5 menos bonus de `mor`.

Fórmulas normativas v1 (adaptadas del GDD §5.2; propuesto, §11):

```
SPEED_MULT      = clamp(1 + 0.025·spd, 1.00, 2.00)
ACTION_INTERVAL = max(18, round(BASE_INTERVAL / SPEED_MULT))       BASE_INTERVAL = 60
HIT_CHANCE      = clamp(0.85 + 0.008·(agi_atacante − agi_defensor), 0.45, 0.98)
CRIT_CHANCE     = clamp(0.03 + 0.004·agi_atacante, 0.03, 0.30)
CRIT_MULT       = 1.5 + 0.02·mor_atacante                            (tope 2.0)
BLOCK_CHANCE    = clamp(0.05 + 0.01·arm_defensor, 0.05, 0.35)        bloqueo: −50 % daño
ARMOR_MITIG     = ARMOR / (ARMOR + 100)                              ARMOR = 4·arm
RAW_DAMAGE      = 8 + 1.2·str
FINAL_DAMAGE    = max(1, round(RAW · VARIANCE · CRIT · (1 − ARMOR_MITIG) · actitud))
VARIANCE        = entero en [90, 110] / 100, del PRNG
```

### 4.3 Elección de acción (IA)

Selección ponderada con el PRNG entre las acciones posibles; los pesos base son
atacar 60 · técnica 15 · defender 5 (defender: +35 armadura hasta su próxima acción), modificados
por personalidad y actitud y acotados a 0..200. La **personalidad es la clase**:

| Clase | Sesgo |
|---|---|
| Bárbaro | +20 atacar; −10 defender |
| Guerrera | +15 defender bajo 35 % de vida |
| Maga | +15 técnica; −10 atacar |
| Clérigo | +10 técnica; +10 defender |
| Bardo | +20 a la acción menos probable (caótico) |
| Ranger | +10 atacar; +5 técnica |

Sin bonificación neta de stats: la personalidad cambia *qué* hace, no *cuánto* pega.

### 4.4 Técnicas de clase (contenido por datos; propuesto, §11)

Una por clase, definida en `battle/content.ts` como datos con `id` estable, no como código
ad hoc en el motor. Cooldown en ticks.

| Clase | Técnica | Efecto | Cooldown |
|---|---|---|---|
| Bárbaro | Golpe brutal | +60 % daño; −15 precisión | 150 |
| Guerrera | Guardia | +40 armadura durante 90 ticks | 180 |
| Maga | Chispa | daño fijo `10 + str` que ignora armadura | 120 |
| Clérigo | Plegaria | cura 18 % de la vida máxima (máx. 2 por combate) | 200 |
| Bardo | Desconcierto | rival: −12 precisión durante 120 ticks | 160 |
| Ranger | Doble flecha | dos golpes al 65 % de daño | 140 |

Los jefes tienen su técnica en la misma tabla (§5.3). Nada de esto exige «destino»: es identidad
de clase, no build.

### 4.5 Eventos

`BattleEvent` con `seq` monótono, `tick`, `type` y payload plano. Tipos mínimos:
`BATTLE_STARTED`, `ACTION_STARTED`, `MISS`, `DODGE`, `BLOCK`, `DAMAGE_APPLIED`, `HEALED`,
`STATUS_APPLIED`, `STATUS_EXPIRED`, `ENTITY_KO`, `BATTLE_ENDED` (con `outcome`, `winner`,
`checksum`). Propiedades que el test de propiedades exige: la vida nunca es negativa en ningún
evento, `seq` crece de uno en uno, toda probabilidad emitida está en rango.

### 4.6 Fin y desempate

KO del que llegue a 0. En el límite: gana quien tenga mayor % de vida; después mayor daño
infligido; después tirada registrada como `TIEBREAK`. Aunque la mascota pierda, **el daño hecho al
jefe cuenta** (raid, §5.4).

## 5. El jefe: derivado del reto

### 5.1 Qué reto tiene jefe

Todo reto propio (`challenges`) **no archivado cuya ventana incluye hoy**. Los retos de club
(`criteria_challenge`) quedan fuera (§2). Un reto sin obras terminadas aún enseña a su jefe
«esperando» (vida entera, 0 intentos).

### 5.2 Stats del jefe (propuesto, §11)

Determinista desde el reto y el nivel actual de la mascota, sin tabla:

- **Vida máxima** = `target_count × BALANCE.battle.bossHpPerWork` (`bossHpPerWork` = 100). Es
  decir: el jefe está pensado para que **cumplir el reto ≈ matarlo** si cada combate hace ~100 de
  daño, que es lo que el simulador calibra para una mascota del nivel de referencia. Una build
  fuerte lo mata antes de acabar el reto; una floja necesita más obras de las que pide el reto (y
  puede no llegar: «escapó»).
- **Stats** = los de una mascota «media» del **nivel actual de la mascota** (tabla de referencia
  por nivel en `BALANCE.battle.bossRef`, salida del simulador), multiplicados por el **perfil del
  tipo**:

| Tipo de reto (`item_type`) | Criatura (id) | Perfil |
|---|---|---|
| `book` | `boss_tome` | equilibrado; `arm` ×1.2 |
| `series` | `boss_serpent` | `spd` ×1.3, `hp` ×0.9 (rápida, muchos golpes) |
| `movie` | `boss_projector` | `str` ×1.3, `hp` ×0.8 (pega fuerte, frágil) |
| `null` (cualquiera) | `boss_chimera` | equilibrado |

La vida máxima **no** depende del nivel (es del reto); los stats sí, para que la pelea sea justa
hoy y no una paliza dentro de un año. Como el jefe no se guarda, un cambio de `BALANCE` recalcula
a todo el mundo, igual que los atributos.

### 5.3 Personalidad y técnica de jefe

Personalidad `boss` (pesos base sin sesgo, +10 defender bajo 25 %). Técnica por criatura, en la
misma tabla de contenido que las de clase: tomo → Página pesada (+50 % daño), serpiente → Mordisco
doble (dos golpes al 60 %), proyector → Deslumbrar (−15 precisión 120 ticks), quimera → Rugido
(+30 armadura 90 ticks).

### 5.4 Vida restante e intentos: derivados

- **Daño acumulado** = `sum(damage_to_b)` de `pet_battles` del reto (columna desnormalizada por
  combate para no releer eventos). **Vida restante** = máxima − acumulado, mínimo 0.
- **Intentos ganados** = obras terminadas que cuentan para el reto **con `finished_on` dentro de la
  ventana**, con el mismo `countForChallenge` (`src/lib/challenges/match.ts`) que pinta la barra del
  reto: un solo criterio de «cuenta para el reto» en todo el proyecto.
- **Intentos pendientes** = ganados − combates registrados del reto, mínimo 0.
- **Estado**: `waiting` (0 combates y 0 pendientes) · `open` (vida > 0, ventana abierta) ·
  `defeated` (vida 0) · `escaped` (ventana cerrada con vida > 0).

Un pase terminado y luego deshecho resta un intento ganado: si ya se gastó, pendientes queda en 0
(nunca negativo) y el combate registrado no se toca. Aceptado y documentado, como con las misiones.

## 6. Datos

**Tabla `pet_battles`** (migración `<fecha>_pet_battles.sql` con la fecha del día que se aplique, **dev primero**):

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid FK `auth.users` cascade | |
| `kind` | text not null | `boss` hoy; `pvp` después. text, no enum |
| `challenge_id` | uuid FK `challenges` **on delete cascade** | null en PvP. Borrar el reto borra sus combates (el jefe no existe sin reto) |
| `attempt_no` | int not null | 1, 2, 3… por reto; **`unique (user_id, challenge_id, attempt_no)`** = idempotencia del doble clic |
| `ruleset_version` | text not null | `v1` |
| `seed` | text not null | 32 hex; la fija el servidor (§6.1). Se guarda en claro: el combate ya está resuelto |
| `attitude` | text not null | `offensive` · `balanced` · `defensive` |
| `snapshot_a`, `snapshot_b` | jsonb not null | `FighterSnapshot` inmutables |
| `events` | jsonb not null | `BattleEvent[]` |
| `winner` | text not null | `a` · `b` · `draw` |
| `outcome` | text not null | `ko` · `limit` |
| `damage_to_a`, `damage_to_b` | int not null | desnormalizado para `sum()` |
| `duration_ticks` | int not null | |
| `checksum` | text not null | |
| `created_at` | timestamptz default now() | |

RLS: `select`/`insert` propias; **sin `update` ni `delete`** (inmutable; el cascade del reto es el
único borrado). **Grant por columna** y superficie 6 de `docs/DRIFT-CHECK.md` (#375). Índice
`(user_id, challenge_id)`. Actualizar `docs/requirements/data-model.md` (§8bis Mascota) y
`schema-baseline.sql`.

### 6.1 Seed y autoridad

`seed = HMAC-SHA256(PET_BATTLE_SECRET, battleId ‖ sha256(snapshot_a) ‖ sha256(snapshot_b))`,
truncada a 128 bits. `battleId` lo genera el servidor. El cliente solo manda `challengeId` y
`attitude`. Secreto nuevo en `.env` (`PET_BATTLE_SECRET`), como `CRON_SECRET`.

### 6.2 Server action `fightBoss(challengeId, attitude)`

1. Sesión; reto propio, no archivado, ventana abierta.
2. Deriva intentos pendientes (§5.4); si 0, error `NO_ATTEMPTS`. Si vida restante 0, `DEFEATED`.
3. Construye snapshots (mascota desde `getPetSnapshot`; jefe desde §5.2), `battleId`, seed.
4. `simulateBattle` con `rulesetVersion` actual.
5. `insert` en `pet_battles` con `attempt_no = combates + 1`. Si choca el `unique` (doble clic),
   devuelve el combate ya guardado con ese `attempt_no`: **idempotente**.
6. Si con este combate la vida llega a 0: gana la celebración `pet_boss_defeated` (scope
   `milestone`, dedupe `pet_boss_defeated:<challenge_id>`) y se evalúa la familia de logros
   `bosses` (§7).
7. Devuelve `{ battle, boss }` para reproducir sin releer.

Sin `use cache` en nada de esto (regla #437: todo depende de la sesión).

## 7. Celebración y logros

- Celebración `pet_boss_defeated` (nuevo `event_type`), con el nombre del reto en el payload. Un
  jefe «escapado» **no** celebra ni avisa: queda en el historial.
- Familia de logros **`bosses`** en `BALANCE.achievements`: `{ steps: [1, 3, 5, 10], then: 5 }`,
  contador `bossesDefeated` en `PetCounts` (retos con vida restante 0: derivado de `pet_battles`,
  no de una marca). Insignia `public/pet/badges/bosses.png` (32 px, PixelLab, como las demás).

## 8. UI

### 8.1 `/mascota` → sección «Jefes»

Debajo de misiones. Una tarjeta por reto con jefe: criatura (sprite `west`, idle), nombre del
reto, barra de vida (restante / máxima), intentos pendientes, estado. Botón **Combatir** (solo con
pendientes > 0 y `open`) abre el selector de actitud (tres botones, equilibrada por defecto; sin
`select`, criterio de Play) y lanza la action.

### 8.2 Replay (vista B invertida)

Panel a lo ancho: **mascota a la izquierda mirando `east`**, jefe a la derecha mirando `west`,
barras de vida arriba, suelo abajo, números flotantes por golpe y **una línea por evento** debajo.
El cliente reproduce `events` en orden con el reloj de ticks a 1× o 2×, botón «Saltar» (va al
resultado). `PetSprite` recibe `anim` de combate y `direction="east"`; el rival PvP (futuro) es el
mismo componente con `mirror`. Con `prefers-reduced-motion`: sin animación de sprites, solo barras
y log.

Resultado: ganador, daño hecho, vida que le queda al jefe, «jefe derrotado» si toca. Historial:
últimos combates del reto (fecha, actitud, resultado, daño), cada uno reproducible.

### 8.3 Compañera

Pasiva: con intentos pendientes > 0 la compañera enseña una burbuja al montar («Un jefe te
espera») una vez por sesión de página; no hay push (#1047 sigue descartado).

## 9. Balance y simulador

`scripts/pet-battle/simulate.mjs --ruleset v1 --battles 10000 --levels 1-40 --seed 42`: importa el
mismo paquete `battle/` (por eso es puro), genera mascotas de referencia por nivel y clase,
las enfrenta a cada criatura y saca CSV: win rate por clase y nivel, duración mediana y p95,
daño medio por combate, uso de técnicas. Umbrales de salida (GDD §15.2 adaptados):

| Métrica | Objetivo |
|---|---|
| Daño medio por combate de la mascota de referencia | 90-110 (= `bossHpPerWork` ± 10 %) en todos los niveles |
| Win rate por clase contra jefes de su nivel | 40-60 % |
| Ninguna clase | > 65 % ni < 35 % contra la misma criatura |
| Duración mediana | 25-45 s a 1× |
| Combates al límite | < 1 % |

`BALANCE.battle.bossRef` (stats medios por nivel) es **salida** del simulador y se versiona con
`rulesetVersion`.

## 10. Arte

Con el pipeline de la canónica (`pet-artist`). Generaciones estimadas:

| Pieza | Gens |
|---|---|
| Mascota: `combat_idle`, `attack`, `hit`, `ko` en **`east`** × 18 estados (v3, 8 frames, 2 gens por animación sobre lienzo de 80) | ~144 |
| 4 criaturas: `create_character` (64, from scratch, `low top-down`) + 4 animaciones en `west` cada una | ~40 |
| Insignia `bosses` | ~2 |
| **Total** | **~190** (saldo 3 471 el 2026-09-04; reserva #1057 ~500) |

`fetch-character.mjs` pasa a exigir también las 4 animaciones de combate en `east` cuando
`characters.json` las declare (`PET_BATTLE_FACING = "east"` en `manifest.ts`, junto a
`PET_FACING`); `sheets.gen.ts` gana `battleAnims`. Los sheets de jefe van a
`public/pet/bosses/<id>.{png,json}` con el mismo formato. El rival PvP se pinta con
`transform: scaleX(-1)` sobre `east`, decidido en el companion visual.

## 11. Propuesto y sin validar (repasar al retomar)

El brainstorming se cerró con las decisiones de §1 y **sin** presentar el diseño por secciones. Lo
siguiente lo ha decidido el agente para que la spec sea ejecutable; hay que confirmarlo o
cambiarlo **antes** del plan:

1. Mapa atributo → stat de §3.1 (en especial CAR → moral/crítico e INT → velocidad) y la función
   de aplastamiento con `attrDivisor = 10`.
2. Fórmulas de §4.2 (traídas del GDD con nuestros stats) y los pesos de personalidad de §4.3.
3. Las seis técnicas de clase (§4.4) y las cuatro de jefe (§5.3): que existan, y sus números.
4. Nombres e ids de las criaturas (§5.2: tomo, serpiente, proyector, quimera) y sus perfiles.
5. `bossHpPerWork = 100` con stats del jefe al nivel actual de la mascota (vida fija por reto,
   stats vivos).
6. Escalera de logros `bosses` `[1, 3, 5, 10]` + 5.
7. Que el reto de club (`criteria_challenge`) quede fuera.
8. La burbuja pasiva de la compañera con intentos pendientes.

## 12. Testing

- **Motor**: unitarios de fórmulas y clamps; vectores del PRNG; **determinismo** (misma entrada →
  mismo checksum, 1 000 veces); propiedades sobre 10 000 combates aleatorios (vida ≥ 0, `seq`
  monótono, sin NaN, termina siempre); **golden replays** por `rulesetVersion` (cambiar un evento
  sin subir versión falla).
- **Derivación**: vida restante, intentos ganados/pendientes y estado con casos de borde (pase
  deshecho, ventana cerrada, reto archivado).
- **Action**: idempotencia por `attempt_no`, `NO_ATTEMPTS`, `DEFEATED`, celebración una sola vez.
- **UI**: `pet-boss-card` y `battle-replay` en jsdom (eventos → barras y log; reduced motion).
- **e2e** (`e2e/mascota.spec.ts`): crear reto → terminar una obra dentro de la ventana →
  intento pendiente en `/mascota` → combatir con actitud → replay → resultado y fila en
  `pet_battles`.
- **Simulador** en CI ligero: 500 combates por clase deben cumplir los umbrales de §9 (falla la
  build si el balance se rompe por un cambio de contenido).

## 13. Doc y seguimiento al cerrar

`data-model.md` (§8bis, tabla `pet_battles`, secreto), `backlog.md` (fase 4), `decisiones.md`
(entrada por el motor y por el jefe derivado), canónica de arte (§3 dirección `east` y jefes,
§7 gens), `.claude/agents/pet-artist.md` (animaciones de combate), `.env.example`
(`PET_BATTLE_SECRET`). Issues de §2. #1015 se cierra con la fase.
