---
title: Estado vacío / pocos datos de la columna de estadísticas (StatsRail)
date: 2026-08-11
status: design
area: home / stats
---

# Estado vacío de la columna de estadísticas del Inicio

## Problema

La columna DERECHA del Inicio ("cómo voy / estadísticas") es `StatsRail`
(`src/components/stats/stats-rail.tsx`). Con un usuario nuevo o de pocos datos
enseña **ceros y gráficos vacíos**: "0 min" con una semana de barras a cero,
"0 completados este año", aro de meta vacío, "Racha 0 días". Es feo y no invita
a nada.

La columna debe adaptarse: mientras no hay datos, una sola **tarjeta de
bienvenida** en vez de bloques vacíos; a medida que llegan datos, cada bloque
**aparece cuando cruza su propio umbral** (revelado progresivo), nunca pintando
un cero.

## Decisiones (del usuario, 2026-08-11)

- **Estrategia: un bloque de bienvenida** mientras la columna está fría.
- **Umbral: progresivo por bloque.** Un bloque sin datos se OCULTA (no muestra
  0s). La bienvenida solo mientras NINGÚN bloque tiene datos.
- **"A quién seguir" se mantiene** (ya se degrada a null si no hay sugerencias).
- **Móvil/tablet (<1100) también adapta**: el resumen de 3 cifras se sustituye
  por la bienvenida compacta cuando está frío.
- **CTAs de la bienvenida**: primario **"Fijar una meta 2026"** (→ Rincón del
  perfil, donde viven retos y meta diaria) + secundario **"Explorar la
  colección"** (→ `/coleccion`).

## Modelo de datos (todo ya existe)

`StatsRail` ya trae en una sola tanda (`Promise.all`):

| Dato | Origen | Señal de "tiene datos" |
|------|--------|------------------------|
| semana | `getWeeklyActivity` → minutos/día | `weekMinutes > 0` |
| año | `getAnnualCompleted` → `total`, `byType` | `annual.total > 0` |
| metas | `getAnnualGoals` → `Record<tipo, number\|null>` | algún tipo con meta ≠ null |
| racha | `getStreaks` → `{ current, best, activeDays }` | `best > 0` / `activeDays > 0` |
| a quién seguir | `getWhoToFollow` | lo gestiona `WhoToFollowCard` (null si vacío) |
| perfil | `getOwnProfile(userId)` | `username` para el href del CTA |

`activeDays` = días distintos con actividad DE SIEMPRE (sesión de cualquier tipo
o algo terminado). Es la señal limpia de "¿ha hecho algo alguna vez?".

`BookGoalCard` y `GoalRows` YA toleran meta `null` (caen a la cifra a secas, sin
aro/barra). No hay que tocarlos.

## Jerarquía de estados

Se derivan tres flags (helper puro, ver abajo):

```
showWeek = weekMinutes > 0
showYear = annual.total > 0 || anyGoalSet || streaks.current > 0
cold     = !showWeek && !showYear     // equivale a activeDays === 0 && !anyGoalSet
```

Render del detalle (≥1100):

```
if (cold)   -> <StatsWelcome username=… />           // una tarjeta, sin ceros
else:
  if (showWeek) -> WeeklyStrip card
  if (showYear) -> "Tu 2026" card (meta + completados + racha)
<WhoToFollowCard/>   // SIEMPRE debajo; ya se degrada a null
```

- `anyGoalSet = annualGoals.book != null || annualGoals.movie != null || annualGoals.series != null`.
- **`streaks.current` (racha VIVA), no `streaks.best`.** Con `best`, un usuario que
  terminó algo el año pasado (racha histórica) pero nada este año y sin meta
  encendería "Tu 2026" y el bloque pintaría "0 completados" — el cero que
  queremos evitar. La racha viva solo es > 0 si hiciste algo hoy o en días
  consecutivos hasta hoy: actividad reciente real.
- El bloque "Tu 2026" solo se pinta con `showYear`, y **cada sub-parte se
  autoprotege** para que el bloque nunca lidere con un cero:
  - `BookGoalCard` (libros): solo si `annualGoals.book != null || annual.byType.book > 0`.
    Si no, se omite (nada de un "0" grande sin meta).
  - `GoalRows` (filas por tipo): solo si `anyGoalSet || annual.total > 0`.
  - `StreakCard` (racha): solo si `streaks.current > 0 || streaks.best > 0`
    (aquí sí vale enseñar la mejor histórica JUNTO a datos reales del año; no
    "Racha 0 días").
  - Como `showYear` exige al menos una de esas condiciones, siempre queda al
    menos una sub-parte visible: el bloque nunca sale vacío.

### Casos

- Usuario nuevo (sin actividad, sin meta): `cold` → bienvenida. Sin ceros.
- Fija una meta sin actividad: `showYear` (anyGoalSet) → "Tu 2026" con aro a
  N/meta y racha oculta. La bienvenida desaparece. Es intención, no vacío.
- Registra una sesión de lectura hoy: `showWeek` (minutos) y `showYear`
  (`best≥1`) → aparecen semana y año.
- Termina una peli (sin minutos): `showWeek` falso, `showYear` verdadero
  (`total≥1`) → aparece solo el año. La semana sigue oculta hasta que leas.

## Responsive (<1100)

El resumen compacto de 3 filas (`SummaryRow` semana/año/racha) vive en una
tarjeta `min-[1100px]:hidden`. Adaptación:

- `cold` → sustituir las 3 filas por una **bienvenida compacta** (una línea +
  CTA primario), misma tarjeta.
- si no `cold` → las 3 `SummaryRow` como ahora (al menos una es ≠ 0).

No se hace revelado por-fila en el resumen compacto (son tres cifras diminutas;
esconder una dejaría un hueco raro). El revelado progresivo por bloque es solo
del detalle ≥1100.

## Componentes

- **`stats-welcome.tsx`** (nuevo, servidor) — la tarjeta de bienvenida.
  - Props: `{ username: string; compact?: boolean }`.
  - `compact` = variante de <1100 (una línea + CTA primario, sin secundario, sin
    encabezado h3 para no chocar con los heading de tests — igual criterio que el
    resumen actual).
  - Estilo del rail: `rounded-card border border-border bg-surface shadow-card p-4`.
  - Copy editorial (no error): título serif breve + una línea. CTAs:
    - primario `Link` a `/u/${username}?tab=rincon` (retos/meta), estilo
      `buttonVariants("primary")`.
    - secundario (solo no-compact) `Link` a `/coleccion`, `buttonVariants("secondary")`.

- **`derive-rail-state.ts`** (nuevo, puro) —
  `deriveRailState({ weekMinutes, annualTotal, anyGoalSet, streakBest }) →
  { showWeek: boolean; showYear: boolean; cold: boolean }`. Sin dependencias,
  unit-testeable (patrón `rotate-index`).

- **`stats-rail.tsx`** (modificar) — calcula `weekMinutes`, `anyGoalSet`, llama
  a `deriveRailState`, y renderiza condicionalmente en los dos breakpoints.
  `StreakCard` envuelto en su guardia `streaks.current>0 || streaks.best>0`.

## i18n

Nuevas claves bajo `statsRail` en `messages/es.json` (único locale):

```
"welcomeTitle": "Aquí verás cómo vas",
"welcomeBody": "Tu semana de lectura, tu año y tu racha aparecerán a medida que registres lo que disfrutas.",
"welcomeGoalCta": "Fijar una meta 2026",
"welcomeExploreCta": "Explorar la colección"
```

(Texto final afinable al implementar; registro editorial actual.)

## Diseño visual

Sin rediseño: se reutiliza la tarjeta del rail (radio, borde, sombra, densidad),
serif de titulares, mono de rótulos, `buttonVariants`. La bienvenida debe
sentirse editorial y útil, no un error.

## Pruebas

- **Unit** (`derive-rail-state.test.ts`): la tabla de casos (frío; solo meta;
  solo semana; solo año/peli; todo).
- **e2e** (`e2e/stats-rail-estado-vacio.spec.ts`): usuario desechable aislado.
  1. frío → ve "Aquí verás cómo vas" y sus CTAs; NO ve "0 min" ni "0 completados".
  2. sembrar una sesión de lectura → aparece "Lectura esta semana"; desaparece la
     bienvenida.
  3. sembrar un pase completado → aparece "Tu 2026".
  Viewport ≥1100 para el detalle.
- `impact(StatsRail)` esperado LOW (solo lo llama `Home`); `detect_changes` antes
  de commit.

## Fuera de alcance (YAGNI)

- Revelado por-fila del resumen compacto de <1100 (solo se cambia frío↔cifras).
- Tocar el panel completo `/estadisticas` (esta feature es solo el rail del Inicio).
- Datos de muestra / teaser (descartado por el usuario).
- Rediseñar `WeeklyStrip`, `BookGoalCard`, `GoalRows`, `StreakCard` más allá de
  envolverlos en su guardia de visibilidad.
