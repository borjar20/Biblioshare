# Sesiones: tiempo relativo correcto usando la hora de registro — diseño

> **[Spec de diseño · propuesta, no construido]** Redactado el 2026-07-28.
>
> **Este ciclo no toca esquema**: ninguna migración, ningún cambio en
> [`data-model.md`](../../requirements/data-model.md). `progress_sessions.created_at`
> (`timestamptz not null default now()`) ya existe desde la creación de la tabla
> (migración `20260708220637 create_progress_sessions`) y ya está en prod.

## 0. Problema

Varias vistas muestran "hace cuánto" fue una sesión, y para una sesión **recién registrada
hoy** enseñan algo como "hace 8 horas" en vez de "hace unos minutos".

Causa: esas vistas calculan el tiempo relativo a partir de `progress_sessions.session_date`,
que es una columna `date` (solo día, sin hora). `new Date("2026-07-28")` se interpreta como
medianoche UTC, así que comparar contra "ahora" da una diferencia de horas aunque la sesión se
acabe de guardar — un artefacto de parseo, no un dato real.

Sitios con el mismo síntoma:

1. `src/components/session-list.tsx:127` — pestaña "Sesiones" de la ficha, vía
   `format.relativeTime(new Date(session.sessionDate))`.
2. `src/lib/social/feed.ts` (evento `"progressed"`, ~línea 490) y
   `src/lib/social/shared-activity.ts` (rama `"progress_sessions"`, ~línea 159) — feed social,
   vía `timeAgo(event.eventDate)` con `eventDate = session_date`.

## 1. Por qué no basta con cambiar `session_date` por `created_at` a secas

`session_date` es **editable a propósito**: el formulario de registrar sesión
(`session-sheet.tsx:236-244`) trae un `<input type="date">` que permite backdatear — el caso
real es "se me olvidó registrar la lectura de anoche, la registro hoy". Ahí `session_date`
(ayer) y `created_at` (ahora) difieren a propósito, y los dos son correctos para lo que
significan.

Sustituir `session_date` por `created_at` sin condición arreglaría el caso de hoy pero rompería
el de backdateo: una sesión de "anoche" registrada esta mañana pasaría a mostrar "hace unos
minutos", que es peor que el bug original.

**Se descarta también** ensanchar `session_date` a `timestamptz` con un selector de hora en el
formulario: para una sesión backdateada el usuario no tiene una hora real que dar (solo sabe
"fue anoche"), así que esa hora sería inventada — la misma falsa precisión del bug original,
solo movida de sitio. Esa idea además pisa el trabajo de `started_at` (§2, más abajo).

## 2. `started_at` es una columna distinta, no se toca aquí

`progress_sessions.started_at` (`timestamptz`, nullable, migración
`20260717195505 progress_sessions_started_at`) ya guarda la **hora real de lectura**, pero
**solo cuando el cronómetro estuvo activo** — la hoja manual la deja `null` a propósito
(`actions.ts:96-98`). Es la columna correcta para una futura estadística de "a qué hora
sueles leer", precisamente porque no se rellena con datos inventados.

`created_at` (este ciclo) responde una pregunta distinta — "¿cuándo se registró esta fila?" —
que es exactamente lo que pide este ciclo y lo que sirve para arreglar el tiempo relativo de
hoy. No se debe usar `created_at` como sustituto de `started_at` en ninguna estadística de
franja horaria de lectura: mezclaría "cuándo leíste" con "cuándo lo apuntaste", que pueden
diferir en horas o días (el propio caso de backdateo). Ampliar la cobertura de `started_at`
(hacer que el formulario manual también la rellene, de algún modo que no invente datos) queda
fuera de este ciclo — issue aparte (§4).

## 3. Decisión

| # | Decisión | Por qué |
|---|---|---|
| D1 | El tiempo relativo de una sesión se calcula sobre `created_at` cuando `session_date` es **hoy** (no backdateada), y sobre `session_date` (comportamiento actual) cuando es una fecha pasada. | Es exactamente la distinción de §1: `created_at` es preciso y real para el caso normal; para el caso backdateado ya no hay hora real que usar, así que se mantiene el nivel de precisión que sí es real (el día). |
| D2 | El corte "¿es backdateada?" compara `session_date` contra `todayISO()` (`src/lib/stats/dates.ts`), no contra un diff de milisegundos. | `todayISO()` ya resuelve "hoy" en el calendario local del usuario — la misma noción de "hoy" que ya usa el resto de stats. Comparar por diferencia de horas reintroduciría el mismo artefacto de huso horario que este ciclo arregla. |
| D3 | Mismo criterio en las tres vistas (ficha, feed personal, feed compartido en club). | Son la misma pregunta ("hace cuánto fue esto") en tres sitios; una sola regla evita que una diga "hace 5 min" y otra "hace 1 día" para la misma sesión. |
| D4 | `session_date` sigue siendo la columna para todo lo que agrupa por día (calendario mensual, rachas, ritmo). No se toca ningún consumidor de agrupación. | Esos usos ya son correctos — el bug es solo de tiempo relativo, no de agrupación. |

## 4. Fuera de alcance — issue aparte

Aumentar la cobertura de `started_at` en la hoja de registro manual (hoy solo la rellena el
cronómetro) es un requisito de una futura estadística "a qué hora sueles leer", no de este
ciclo. Se abre como issue en el repo, sin implementar aquí (regla de `AGENTS.md`: lo pendiente
vive como issue, no como nota suelta).

## 5. Cambios (sin migración)

- `src/lib/sessions/get-sessions.ts` — añadir `created_at` al `select`; mapear a
  `createdAt` en `ProgressSession`.
- `src/lib/sessions/types.ts` — `ProgressSession.createdAt: string`.
- `src/components/session-list.tsx` — nueva función pura (p. ej. `sessionRelativeBasis`)
  que aplica D1/D2; se usa tanto para `format.relativeTime(...)` como para el atributo
  `dateTime` del `<time>` (debe reflejar la misma base que el texto que acompaña).
- `src/lib/social/feed.ts` — query `"progressed"`: añadir `created_at` al `select`.
  **El `.order("session_date", ...)` y el `.lte("session_date", dateUpperBound(...))` NO
  cambian** — es lo que mantiene el backdateo en su sitio cronológico dentro del feed (una
  sesión de "anoche" registrada hoy sigue apareciendo donde corresponde a ayer, no saltando
  al principio). Lo único que cambia es el valor de `eventDate` que se construye por fila al
  montar el `FeedEvent` (~línea 490): la misma función pura de D1/D2 en vez de `r.session_date`
  a secas. El fichero ya deja documentado que mezclar granularidades entre fuentes dentro del
  mismo cursor keyset es un patrón soportado a propósito (comentario de cabecera, líneas
  105-112) — este cambio añade una fuente más a esa mezcla, no un caso nuevo.
- `src/lib/social/shared-activity.ts` — rama `"progress_sessions"`: añadir `created_at` al
  `select`; mismo cálculo de `eventDate` que en feed.ts. Aquí no hay paginación que proteger
  (resuelve una fila suelta), así que no aplica la salvedad del punto anterior.
