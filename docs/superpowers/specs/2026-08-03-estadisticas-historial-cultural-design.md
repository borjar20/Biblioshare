# Estadísticas como historial cultural multi-tipo

`[Canónico · verificado 2026-08-03]`

## Problema

El panel de estadísticas (`/estadisticas` y el muro del perfil `StatsTab`) está
diseñado para un lector de libros que cronometra sesiones de lectura. La mitad
de las tarjetas se calculan desde `progress_sessions`. Para un usuario cuya
actividad es sobre todo cine y registro de obras ya terminadas, eso sale vacío o
engañoso.

Datos reales del dueño de la cuenta (verificado en prod, 2026-08-03):

- 118 pases, 110 completados (**92 películas, 17 libros, 1 serie**), repartidos
  de 2015 a 2026 (34 solo en 2026). Las 110 tienen nota.
- Solo **4 sesiones de lectura**, **0 con `started_at`**, 2 libros con páginas.

Consecuencia por tarjeta:

| Tarjeta | Fuente | Resultado |
|---|---|---|
| Horas por mes | sesiones | barras casi vacías |
| Cuándo lees (hábitos) | `started_at` | **franja siempre nula** |
| Ritmo pág/día | páginas en sesiones | casi `null` |
| Tira semanal | minutos de lectura | muerta para cine |
| La pila (TBR) | `passes` (mal contado) | crecimiento = basura |
| Rating / tipos / géneros / autores / décadas / récords | `passes` | **funcionan** |

### El bug de "la pila"

`getTbrTrend` cuenta como *añadido a la pila* **cualquier** pase creado ese año,
sea cual sea su estado. Como el historial ya terminado se registra creando pases
"completed" (34 en 2026), el crecimiento anual (`netThisYear`) y las barras
mensuales "añadidos vs terminados" no significan nada. `pending` (6) sí es
correcto.

Nota de fondo: los 118 pases se importaron ya terminados; **nunca pasaron por
`planned` dentro de la app**. Ningún histórico puede reconstruir un flujo que no
ocurrió, así que un gráfico de flujo estaría vacío durante meses de uso real.
Por eso la pila se rediseña como foto del momento (ver Decisión 1).

## Principio de diseño

Toda tarjeta se alimenta de `passes` (la historia real, 110 obras). Las métricas
que solo tienen sentido con sesiones de lectura cronometradas muestran un
*empty state* honesto cuando no hay sesiones, en vez de ceros o barras vacías.
No se borra nada: cuando el usuario registre sesiones, esas tarjetas reviven.

## Cambios

### A. Arreglos

**A1 · La pila = foto del momento.** Rediseñar `getTbrTrend` → `getTbrSnapshot`
y `TbrCard`. Eliminar el flujo mensual añadidos/terminados y `netThisYear`.
Mostrar:

- Pendientes ahora (`passes` con `is_active` y `status='planned'`), total.
- Desglose por tipo (cine / libro / serie).
- La obra más antigua en la pila y su antigüedad (por `created_at`, hasta que
  existan las columnas hito — ver Decisión 1 e issue de seguimiento).

`TbrCard` deja de pintar barras; pinta el total, tres contadores por tipo y una
línea "lo más viejo: «Título», hace N meses". Si no hay pendientes, empty state.

**A2 · Empty states en las tarjetas de sesión.** `HoursByMonthCard`,
`HabitsCard` y `PaceCard` muestran "Aún sin sesiones de lectura" (copy en
`messages/*.json`) cuando su fuente está vacía, en vez de barras a cero o franja
nula. La lógica de los getters no cambia; el empty state se decide en la tarjeta
a partir de los datos que ya devuelven (arrays a cero / `null`).

**A3 · Tira semanal = cualquier actividad.** `getWeeklyActivity` hoy solo suma
minutos de lectura de libros, así que una noche de cine no aparece. Ampliarla a
"día activo" con la misma definición que `getStreaks` (sesión de cualquier tipo
**o** pase terminado ese día). Se mantiene `minutes` para el objetivo diario de
lectura, pero `active` pasa a ser verdadero también con finales de cualquier
tipo. `WeeklyStrip` ya distingue minutos de actividad; revisar que el punto de
"activo sin minutos" se pinte (p. ej. día con película pero 0 min de lectura).

### B. Tarjetas nuevas (todo desde `passes`)

**B1 · Completadas por año** (titular de `/estadisticas`). Nuevo getter
`getCompletedByYear(userId)`: cuenta pases terminados agrupados por año de
`finished_on`, apilados por tipo. Devuelve `{ year, book, movie, series }[]`
desde el primer año con datos hasta el actual (rellenando años vacíos con 0).
Nueva `CompletedByYearCard`: histograma apilado por tipo, con leyenda de tipos.
Es el dato más rico (11 años) y hoy no existe ninguna vista multi-año.

**B2 · Este año vs el anterior.** Derivado de B1 (no hace query nueva):
contador del año en curso, del anterior y el delta. Puede ser una franja dentro
de `CompletedByYearCard` o una tarjeta pequeña propia; se decide en el plan.

**B3 · Mejor valoradas.** Nuevo getter `getTopRated(userId, period)`: obras
terminadas con `rating` máximo (5★, o el máximo existente si no hay 5★),
hidratando título y tipo, hasta N (p. ej. 6). Nueva `TopRatedCard`: lista
compacta con título, tipo y estrellas. Respeta el selector de período de la
página completa.

### C. Ubicación

- **`/estadisticas`** (`page.tsx`): reordenar el array `cards` para que
  `CompletedByYearCard` y `RatingCard` encabecen; las de sesión (horas, hábitos)
  bajan. Añadir `TopRatedCard`. La pila usa la nueva `TbrCard`.
- **Muro del perfil** (`StatsTab`): el rail de lectura (tira semanal, ritmo,
  hábitos, calendario) degrada con sus empty states; el muro principal mantiene
  rating, récords y la nueva pila. Sin reestructurar los dos árboles (regla de
  `StatsTab`), solo se sustituyen tarjetas 1:1.

## Decisiones

**Decisión 1 — La pila es foto del momento, no flujo.** Un flujo fiable exige
saber cuándo cada pase entró y salió de `planned`; `passes` no lo guarda y el
historial importado nunca transitó por ahí. La foto del momento es honesta con
los datos que existen. **Coste/beneficio evaluado:** columnas hito
`planned_on`/`started_on` en `passes` (coste bajo, valor transversal: ordenar la
pila por antigüedad, "empezado el X" en el pase-hub, arreglar `fastestBook` que
hoy usa `created_at` como falso inicio) **sí** compensan; una tabla de auditoría
`pass_events` (coste alto, solo hacia delante) es YAGNI. Ambas capturan datos
solo a futuro, así que no habilitan un flujo útil hasta meses de uso.
→ **Issue de seguimiento:** añadir `planned_on`/`started_on` y, cuando haya
datos, una vista de flujo opcional en la pila.

**Decisión 2 — Empty states, no borrado.** Las tarjetas de sesión se conservan;
solo degradan cuando faltan datos. Un usuario que empiece a cronometrar lectura
las verá cobrar vida sin cambios de código.

**Decisión 3 — Alcance de esta tanda.** Arreglos A1–A3 + tarjetas B1–B3. Las
columnas hito y el flujo de la pila quedan fuera, como issue.

## Testing

- **Unit (Vitest):** `getCompletedByYear` (relleno de años vacíos, apilado por
  tipo, año sin datos), `getTopRated` (máximo cuando no hay 5★, corte a N,
  período), y `getTbrSnapshot` (obra más antigua, desglose por tipo, pila vacía).
  Reutilizar el patrón puro/testeable de `computeHabits`/`computePagesPerDay`
  (función pura + getter fino) donde aplique.
- **E2E (Playwright):** extender `e2e/estadisticas.spec.ts` — la página carga,
  aparece "completadas por año", la pila no muestra crecimiento inventado, y las
  tarjetas de sesión muestran el empty state con una cuenta sin sesiones.

## Fuera de alcance

- Columnas hito `planned_on`/`started_on` y flujo real de la pila (issue aparte).
- Director/reparto de películas como "autores" (hoy `movies` no lo trae; la
  tarjeta Autores sigue siendo solo de libros).
- "Páginas leídas" como métrica (solo 2 de 17 libros tienen `total_pages`).

## Doc a sincronizar al cerrar

- `docs/requirements/data-model.md`: solo si se tocan columnas (en esta tanda,
  **no** se toca esquema).
- `docs/requirements/backlog.md`: marcar la mejora de estadísticas.
- `docs/requirements/decisiones.md`: append de la Decisión 1 (foto vs flujo).
- Issue nueva: columnas hito + flujo de la pila.
