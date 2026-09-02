# Mascota: logros por familias con escalera abierta e insignias

> **[Histórico · congelado 2026-09-02]** Spec de diseño que sustituye los logros planos de la fase 2
> (`2026-09-02-mascota-misiones-logros-design.md` §2) por **familias con niveles incrementales sin
> tope** y una **insignia pixel art por familia**. Explica el *porqué*; el estado de hoy manda en el
> código. Se construye en la rama `feat/mascota-rpg` (PR #1027, sin mergear).

## Criterio

El de la mascota: **espejo, no máquina de culpa; todo lo derivable se deriva**. Un logro sigue siendo
un umbral sobre un contador que ya existe; lo nuevo es que cada familia tiene una **escalera** de
umbrales que no se acaba, la vitrina enseña **la última insignia conseguida y la siguiente por
conseguir**, y cada familia tiene una imagen propia del mismo mundo que la ardilla. Sin XP por logro,
sin tabla nueva: el rastro (y la fecha) sigue siendo la celebración.

Decisiones del usuario (2026-09-02, brainstorming en terminal): insignias **pixel art propias** con el
pipeline de la ardilla; escalera **abierta** (sin tope de niveles); vitrina = **última conseguida +
siguiente**; escalera **lista a mano + paso fijo** (p. ej. `posts`: 50, 100, 150, 300 y luego +300);
insignia **una por familia**, el nivel se pinta con número y marco, no con variantes de arte.

## 1. Familias y escalera

`src/lib/pet/achievements.ts` deja de ser una lista plana de ids y pasa a **familias**. Los números
viven en `BALANCE.achievements` (`src/lib/pet/balance.ts`, único sitio con números):

| familia | mide (`PetCounts` o nivel) | `steps` | `then` |
|---|---|---|---|
| `finished` | `finishedPasses` (vividas) | 10, 50, 100, 200 | +100 |
| `sessions` | `sessionUnits` | 100, 250, 500, 1000 | +500 |
| `episodes` | `episodes` | 100, 250, 500, 1000 | +500 |
| `notes` | `notes + quotes` | 50, 100, 200, 400 | +200 |
| `reviews` | `reviews` | 10, 25, 50, 100 | +50 |
| `genres` | `distinctGenres` | 10, 15, 20, 30 | +10 |
| `streak` | `bestStreak` (vivida) | 30, 100, 200, 365 | +365 |
| `posts` | `posts` | 50, 100, 150, 300 | +300 |
| `sagas` | `completedSagas` | 3, 5, 10, 20 | +10 |
| `missions` | `missionsCompleted` | 50, 100, 200, 400 | +400 |
| `stage` | nivel de la mascota | 10, 40 | cerrada (`null`) |

Tipos y funciones puras:

```ts
type Ladder = { steps: readonly number[]; then: number | null };
/** Umbral del nivel `tier` (>= 1). Más allá de `steps`: último + then × exceso. Cerrada y fuera de rango: null. */
thresholdFor(ladder, tier): number | null
/** Mayor nivel cuyo umbral <= value. 0 = ninguno. Nunca pasa del último de una escalera cerrada. */
tierFor(ladder, value): number
/** Por familia: { family, value, tier, threshold (del tier actual o null si 0), nextThreshold (null si cerrada y completa), unlockedAt } */
familyProgress(counts, level): FamilyProgress[]
```

Reglas:
- **Clave de celebración**: `pet_achievement:<familia>:<tier>` (scope `key` ya existente). Una fila por
  nivel: cada nivel tiene su fecha.
- **Subir varios niveles de golpe** (un importador que llega con 150 obras vividas, o un rebalanceo):
  se ganan **todas** las filas intermedias (para que la vitrina tenga fecha de cada nivel) y se anima
  **solo la más alta**. Las intermedias se ganan selladas (`alreadyDisplayed`, ya existe en
  `earnCelebration`).
- **Backfill** de la primera visita: igual que hoy (si el usuario no tiene ninguna fila
  `pet_achievement`, todo se gana sellado y no se anima).
- **Escalera cerrada** (`stage`): `tierFor` no pasa de `steps.length`; `nextThreshold` es `null` al
  completarla.
- `payload.title` de la celebración = «<nombre de familia> · nivel N» (texto de `messages/es.json`),
  para que el overlay diga cuál (cierra la mitad de #1038).

## 2. Migración de datos de las claves antiguas

`supabase/migrations/20260904_pet_achievement_tiers.sql` (**dev primero, luego prod**): renombra
`event_key` de las filas `event_type = 'pet_achievement'` con clave plana a la clave por familia:

| antigua | nueva |
|---|---|
| `finished_10` / `finished_50` / `finished_100` | `finished:1` / `finished:2` / `finished:3` |
| `sessions_100` | `sessions:1` |
| `episodes_100` | `episodes:1` |
| `notes_50` | `notes:1` |
| `reviews_10` | `reviews:1` |
| `genres_10` | `genres:1` |
| `streak_30` / `streak_100` | `streak:1` / `streak:2` |
| `posts_50` | `posts:1` |
| `sagas_3` | `sagas:1` |
| `missions_50` | `missions:1` |
| `adult` / `veteran` | `stage:1` / `stage:2` |

Todas las antiguas casan con un nivel de la escalera nueva (los primeros `steps` se han elegido para
eso), así que **ninguna fecha se pierde ni nada se re-anima**. `on conflict` no aplica: la clave nueva
no puede existir aún. Verificación tras aplicar: `select count(*) from user_celebrations where
event_type = 'pet_achievement' and event_key not like 'pet_achievement:%:%'` = 0. Estado en prod al
escribir esta spec: dos filas (`finished_10`, `reviews_10`), selladas.

`isAchievementId` desaparece; `parseAchievementKey(event_key): { family, tier } | null` la sustituye
en `getPetSnapshot` y **ignora** cualquier clave que no parsee (fail-closed, como hoy).

## 3. Insignias

- **Ficheros**: `public/pet/badges/<familia>.png`, 32×32, pixel art, uno por familia (11). Provisional
  procedural con `scripts/pet-badges.mjs` (mismo enfoque que `scripts/pet-sprites.mjs`): silueta
  reconocible por familia — `finished` libro cerrado, `sessions` reloj de arena, `episodes` pantalla,
  `notes` pluma, `reviews` estrella, `genres` brújula, `streak` llama, `posts` bocadillo, `sagas`
  cadena, `missions` diana, `stage` bellota. El arte IA curado sustituye los PNG con los mismos nombres
  (se anota en #1021).
- **Manifiesto**: `BADGE_MANIFEST` en `src/lib/pet/badges.ts` (familia → ruta) y test que exige que
  cada familia de `ACHIEVEMENT_FAMILIES` tenga su PNG en disco.
- **Componente** `src/components/pet/achievement-badge.tsx`: `<AchievementBadge family tier
  state="earned" | "next" size?>`. Pinta la imagen con `image-rendering: pixelated`, un **marco** cuyo
  color cicla por nivel — `(tier − 1) mod 4` → bronce, plata, oro, leyenda — y el **número de nivel**
  en la esquina inferior derecha. `state="next"`: escala de grises + opacidad. Los cuatro colores del
  marco viven en `achievement-badge.module.css`; no se añaden tokens globales.

## 4. Vitrina

`src/components/pet/achievement-grid.tsx` se reescribe: **una tarjeta por familia** con dos huecos.

- **Conseguido**: insignia del nivel actual (`earned`), «Nivel N · umbral» y fecha del desbloqueo de
  ese nivel. Con nivel 0: la insignia en `next` sin número y el texto «Sin nivel aún».
- **Siguiente**: insignia gris del nivel N+1, umbral y barra `valor / umbral` (`role="progressbar"`
  con `aria-label`). Escalera cerrada y completa: el hueco dice «Completa» y no hay barra.

Orden: nivel más alto primero; empate, por cercanía al siguiente (`value / nextThreshold` desc);
familias completas al final. Textos en `messages/es.json`, `pet.achievements`: `<familia>` (nombre),
`tier` («Nivel {tier}»), `earnedOn`, `next`, `none`, `complete`, `threshold`. Los `data-testid` pasan a
`achievement-<familia>` con `data-tier="N"`.

## 5. Snapshot

`getPetSnapshot` sustituye `achievementProgress`/`unlockedAchievements` por `familyProgress`:
1. Lee las filas `pet_achievement` del usuario y las parsea a `{ family, tier, first_triggered_at }`.
2. Por familia, `tierFor(ladder, value)`; para cada nivel `1..tier` sin fila, gana
   `pet_achievement:<familia>:<n>`; solo el nivel más alto nuevo se gana **sin** sellar (y solo si no
   es backfill); el resto sellados. Todo en `Promise.all`.
3. Devuelve `achievements: FamilyView[]` con `unlockedAt` del nivel actual.

`achievementsUnlockedNow` conserva la semántica: true si esta lectura animó algún nivel.

## 6. Testing

- **Vitest**: `thresholdFor` (nivel dentro de `steps`, más allá, cerrada, tier 0/negativo → null);
  `tierFor` (valor = umbral exacto, entre pasos, por encima de `steps`, cerrada topa); `familyProgress`
  con `EMPTY_COUNTS` (todo nivel 0 y `nextThreshold` = primer paso) y con el caso `posts: 160` →
  nivel 3, siguiente 300; `parseAchievementKey` (claves nuevas, antiguas → null, basura → null);
  manifiesto de insignias; la lógica de «gana intermedios sellados y anima el más alto» extraída a
  una función pura `planAchievementEarns(progress, earnedKeys, backfill)` con test.
- **E2E** (`e2e/mascota-misiones.spec.ts`, mismo fichero): la galería enseña una tarjeta por familia
  con «Siguiente» y umbral; tras el `afterAll` no queda ninguna clave sin `:` (comprobación por API).

## 7. Fuera de alcance

- Insignia dentro del overlay de celebración (hoy glifo genérico) — issue.
- Arte IA curado de las insignias — se añade a #1021.
- Variantes de arte por nivel — descartado a propósito (el nivel es número + marco).
