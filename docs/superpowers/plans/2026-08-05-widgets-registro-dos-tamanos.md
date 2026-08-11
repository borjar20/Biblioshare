# Dos widgets Android de registro — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dos widgets de pantalla de inicio sobre «en curso»: **Completo** (destacado rico + rejilla que cambia el foco + cronómetro nativo) y **Registro rápido** (2 pasos), pintando un snapshot v2 que genera la web.

**Architecture:** El widget NO habla con Supabase: pinta un snapshot (JSON) que la app genera en TS y persiste vía plugin Capacitor; Kotlin/Glance solo dibuja. Toda la selección/formato vive en TS. La interacción sin abrir la app (cambio de foco, pasos, cronómetro) usa **Glance state** por instancia + `actionRunCallback`; guardar una sesión abre la app con la hoja rellena.

**Tech Stack:** Next.js (server actions), TypeScript, Vitest; Android Glance (androidx.glance), Kotlin, JUnit JVM; Capacitor plugin.

## Global Constraints

- **Repo mono-idioma `es`**: no crear `en.json`. Las cadenas del widget se **hardcodean en TS** (el build ya lo hace hoy: `"… de … páginas"`), replicando el catálogo. Valores exactos: `nth.book`=`"{n}.ª lectura"`, `nth.series`=`"{n}.º visionado"`; `mediaLabel`: `book`=`"Libro"`, `series`=`"Serie"`; `today.day`=`"Día {n}"`, `today.since`=`"desde {date}"`, `today.notes`= `1`→`"1 nota"` / `n`→`"{n} notas"`, `today.noProgress`=`"Sin progreso"`.
- **Espejo de esquema**: `src/lib/widgets/types.ts` y `android/.../WidgetSnapshot.kt` deben coincidir; al cambiar cualquiera, subir `WIDGET_SCHEMA_VERSION` en **ambos** (aquí: `1 → 2`).
- **Server actions no lanzan**: resultado discriminado (Next.js redacta `Error.message` en prod). `actions.ts` ya lo cumple; mantenerlo.
- **`use cache` prohibido con datos por-usuario** (RLS). Nada de esto se cachea: el snapshot sale de `actions.ts` con la sesión del usuario.
- **Solo libros** tienen cronómetro/registro por minutos; **series** se registran por episodio; **películas no llegan a «en curso»** y ningún widget las trata.
- **Verificación sin emulador**: lógica pura en Vitest (TS) y JUnit JVM (Kotlin); las composables Glance se verifican en previews de Android Studio (`src/debug`) y en dispositivo (**#485**). Glance UI no se testea en JVM — es el patrón ya establecido (`WidgetPreviews.kt` vs `WidgetStateTest.kt`).
- **Higiene**: un solo `next dev` en el puerto 3000; limpiar worktrees al cerrar.

---

## Mapa de ficheros

**TypeScript (web)**
- `src/lib/widgets/types.ts` — MOD: snapshot v2 (`inProgress[]`, campos ricos).
- `src/lib/widgets/build-widget-snapshot.ts` — MOD: `buildInProgress`, labels hardcodeadas.
- `src/lib/widgets/build-widget-snapshot.test.ts` — MOD: tests v2.
- `src/lib/widgets/actions.ts` — MOD: pasa todos los pases + total.
- `src/lib/native/android-widgets.ts` — MOD: envolturas del cronómetro nativo.
- `src/lib/sessions/timer.ts` — MOD: espejo app→nativo en `writeTimer`/`clearTimer`.
- `src/lib/native/widget-timer-bootstrap.ts` — CREATE: siembra nativo→app al abrir.

**Kotlin (`android/app/src/main/java/app/biblioshare/mobile/widgets/`)**
- `WidgetSnapshot.kt` — MOD: v2 (data classes + parse).
- `WidgetState.kt` — MOD: selección de destacado + estado del reducido.
- `WidgetUi.kt` — MOD: helpers compartidos (racha, semana, rejilla, fila compacta, chips).
- `CurrentProgressWidget.kt` — MOD: layout Completo + foco + Glance state + cronómetro.
- `QuickRegisterWidget.kt` — CREATE: widget reducido (2 pasos).
- `TimerStore.kt` — CREATE: estado nativo del cronómetro.
- `WidgetTimer.kt` — CREATE: cálculo puro (elapsed/minutos/stale).
- `WidgetActions.kt` — CREATE: `actionRunCallback` (foco, pasos, cronómetro).
- `BiblioshareWidgetPlugin.kt` — MOD: métodos `getRunningTimer/setRunningTimer/clearRunningTimer`; prefetch de portadas de todos los `inProgress`.
- `res/layout/widget_chronometer.xml` — CREATE: `Chronometer` para `AndroidRemoteViews`.
- `res/xml/quick_register_widget_info.xml` — CREATE: provider info del reducido.
- `AndroidManifest.xml` — MOD: receiver del reducido.

**Kotlin test (`android/app/src/test/.../widgets/`)**
- `WidgetSnapshotTest.kt` — MOD: parse v2.
- `WidgetStateTest.kt` — MOD: selección + pasos.
- `TimerStoreTest.kt` / `WidgetTimerTest.kt` — CREATE.

**Kotlin debug (`android/app/src/debug/.../widgets/`)**
- `WidgetPreviews.kt` — MOD: previews de ambos widgets.

---

# FASE 0 — Snapshot v2 (TypeScript)

### Task 1: Reformar `types.ts` a v2

**Files:**
- Modify: `src/lib/widgets/types.ts`

**Interfaces:**
- Produces: `WIDGET_SCHEMA_VERSION = 2`; tipos `CurrentProgressWidgetData` (con `nthLabel`, `contextLabel`, `streakDays`, `week: WidgetWeekDay[]`, `kindLabel`), `WidgetWeekDay`, `WidgetSnapshot` (con `inProgress: CurrentProgressWidgetData[]`, `inProgressTotal`, `dailyGoal`).

- [ ] **Step 1: Reescribir el contrato**

Reemplaza el bloque de tipos (deja `DailyGoalWidgetData` como está) por:

```ts
export const WIDGET_SCHEMA_VERSION = 2;

export type WidgetWeekDay = { active: boolean; today: boolean };

export type CurrentProgressWidgetData = {
  passId: string;
  itemType: "book" | "movie" | "series";
  itemId: string;
  title: string;
  subtitle?: string | null;
  coverUrl?: string | null;
  percentage?: number | null; // null = "Sin progreso"
  progressLabel: string;
  deepLink: string;
  nthLabel: string; // "1.ª lectura"
  contextLabel: string; // "Día 4 · desde 2/8 · 1 nota" (puede ir vacío)
  streakDays: number; // 0 = sin racha
  week: WidgetWeekDay[]; // 7 días, antiguo→hoy
  kindLabel: string; // "Libro" | "Serie"
};

export type WidgetSnapshot = {
  version: number;
  userId: string;
  generatedAt: string;
  inProgress: CurrentProgressWidgetData[]; // [0] = destacado por defecto
  inProgressTotal: number;
  dailyGoal: DailyGoalWidgetData | null; // GLOBAL (meta de hoy)
};
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: errores SOLO en `build-widget-snapshot.ts` y `actions.ts` (se arreglan en Tasks 2–3). Si aparecen otros consumidores de `currentProgress`, anótalos para esos tasks.

- [ ] **Step 3: Commit**

```bash
git add src/lib/widgets/types.ts
git commit -m "feat(widgets): snapshot v2 — lista de en curso rica"
```

---

### Task 2: `buildInProgress` con labels hardcodeadas (TDD)

**Files:**
- Modify: `src/lib/widgets/build-widget-snapshot.ts`
- Test: `src/lib/widgets/build-widget-snapshot.test.ts`

**Interfaces:**
- Consumes: `TodayPass` (de `@/lib/stats/get-today-focus`), `getProgress`, `itemHref`.
- Produces: `buildInProgress(passes: TodayPass[]): CurrentProgressWidgetData[]`; `buildWidgetSnapshot({ userId, passes, date, goalMinutes, todayMinutes, streak, now? })`.

- [ ] **Step 1: Escribir el test que falla**

Añade a `build-widget-snapshot.test.ts` (junto a los `input` existentes; crea un `TodayPass` de libro con progreso, racha y notas):

```ts
import { buildInProgress } from "./build-widget-snapshot";

function bookPass(over: Partial<TodayPass> = {}): TodayPass {
  return {
    item: {
      entryId: "e1", activePassId: "p1", itemType: "book", itemId: "b1",
      title: "Salitre y Cenizas", subtitle: "Carlos de Traspe", coverUrl: null,
      status: "in_progress", position: { page: 60, pageCount: 240 } as never,
      rereadCount: 0, pinnedOrder: null,
    } as never,
    startedOn: "2026-08-02", lastSessionDate: "2026-08-05", noteCount: 1,
    dayNumber: 4, streakDays: 3,
    week: [
      { date: "2026-07-30", active: false }, { date: "2026-07-31", active: false },
      { date: "2026-08-01", active: false }, { date: "2026-08-02", active: true },
      { date: "2026-08-03", active: true }, { date: "2026-08-04", active: true },
      { date: "2026-08-05", active: true },
    ],
    ...over,
  };
}

describe("buildInProgress", () => {
  it("primer pase: ordinal, contexto, semana y kind", () => {
    const [d] = buildInProgress([bookPass()]);
    expect(d.nthLabel).toBe("1.ª lectura");
    expect(d.contextLabel).toBe("Día 4 · desde 2/8 · 1 nota");
    expect(d.kindLabel).toBe("Libro");
    expect(d.percentage).toBe(25);
    expect(d.week[6]).toEqual({ active: true, today: true });
    expect(d.week[0]).toEqual({ active: false, today: false });
  });

  it("relectura: ordinal +1 y notas en plural; sin progreso → 'Sin progreso'", () => {
    const p = bookPass({
      item: { ...bookPass().item, rereadCount: 1, position: {} as never } as never,
      noteCount: 3, dayNumber: null, startedOn: null,
    });
    const [d] = buildInProgress([p]);
    expect(d.nthLabel).toBe("2.ª lectura");
    expect(d.percentage).toBeNull();
    expect(d.progressLabel).toBe("Sin progreso");
    expect(d.contextLabel).toBe("3 notas"); // sin día ni desde
  });
});
```

- [ ] **Step 2: Ejecutar y ver fallar**

Run: `npm run test -- build-widget-snapshot`
Expected: FAIL (`buildInProgress` no existe).

- [ ] **Step 3: Implementar**

En `build-widget-snapshot.ts`, sustituye `buildCurrentProgressData` por `buildInProgress`. Reutiliza la lógica de progreso/deeplink existente. Añade los helpers de label (hardcode es):

```ts
function nthLabel(itemType: string, rereadCount: number): string {
  const n = rereadCount + 1;
  return itemType === "book" ? `${n}.ª lectura` : `${n}.º visionado`;
}

function kindLabel(itemType: string): string {
  return itemType === "series" ? "Serie" : "Libro";
}

function contextLabel(pass: TodayPass): string {
  const parts: string[] = [];
  if (pass.dayNumber != null) parts.push(`Día ${pass.dayNumber}`);
  if (pass.startedOn) parts.push(`desde ${shortDate(pass.startedOn)}`);
  if (pass.noteCount > 0) parts.push(pass.noteCount === 1 ? "1 nota" : `${pass.noteCount} notas`);
  return parts.join(" · ");
}

function oneInProgress(pass: TodayPass): CurrentProgressWidgetData {
  const { item } = pass;
  const progress = getProgress(item);
  const percentage = progress
    ? Math.min(100, Math.round((progress.current / progress.total) * 100))
    : null;
  const deepLink =
    item.itemType !== "movie" && item.activePassId
      ? `/sesion/${item.activePassId}`
      : itemHref(item.itemType, item.itemId);
  // progressLabel: reutiliza la redacción existente por tipo; sin progreso → "Sin progreso".
  let progressLabel = "Sin progreso";
  let subtitle = item.subtitle;
  if (item.itemType === "book" && progress) {
    progressLabel = `${progress.current} de ${progress.total} páginas`;
  } else if (item.itemType === "series") {
    if ("season" in item.position) {
      subtitle = `Temporada ${item.position.season} · Episodio ${item.position.episode}`;
    }
    if (progress) progressLabel = `${progress.current} de ${progress.total} episodios`;
  }
  return {
    passId: item.activePassId ?? "",
    itemType: item.itemType,
    itemId: item.itemId,
    title: item.title,
    subtitle,
    coverUrl: item.coverUrl,
    percentage,
    progressLabel,
    deepLink,
    nthLabel: nthLabel(item.itemType, item.rereadCount),
    contextLabel: contextLabel(pass),
    streakDays: pass.streakDays,
    week: pass.week.map((d, i) => ({ active: d.active, today: i === pass.week.length - 1 })),
    kindLabel: kindLabel(item.itemType),
  };
}

export function buildInProgress(passes: TodayPass[]): CurrentProgressWidgetData[] {
  return passes.map(oneInProgress);
}
```

Actualiza `buildWidgetSnapshot` para aceptar `passes: TodayPass[]` y `total: number`:

```ts
export function buildWidgetSnapshot(input: {
  userId: string;
  passes: TodayPass[];
  total: number;
  date: string;
  goalMinutes: number | null;
  todayMinutes: number;
  streak: number;
  now?: Date;
}): WidgetSnapshot {
  return {
    version: WIDGET_SCHEMA_VERSION,
    userId: input.userId,
    generatedAt: (input.now ?? new Date()).toISOString(),
    inProgress: buildInProgress(input.passes),
    inProgressTotal: input.total,
    dailyGoal: buildDailyGoalData(input),
  };
}
```

(`buildDailyGoalData` y `snapshotFingerprint` no cambian.)

- [ ] **Step 4: Adaptar los tests existentes de `buildWidgetSnapshot`**

En los tests de `buildWidgetSnapshot + snapshotFingerprint`, cambia el `input` para usar `passes: [featured]` y `total: 1` en vez de `featured`. Verifica que `snapshotFingerprint` sigue estable (ignora `generatedAt`).

- [ ] **Step 5: Ejecutar y ver pasar**

Run: `npm run test -- build-widget-snapshot`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/widgets/build-widget-snapshot.ts src/lib/widgets/build-widget-snapshot.test.ts
git commit -m "feat(widgets): buildInProgress con labels ricas (v2)"
```

---

### Task 3: `actions.ts` pasa todos los pases

**Files:**
- Modify: `src/lib/widgets/actions.ts`

**Interfaces:**
- Consumes: `buildWidgetSnapshot({ passes, total, ... })` de Task 2.

- [ ] **Step 1: Ajustar la construcción del snapshot**

Reemplaza el objeto que pasa a `buildWidgetSnapshot`:

```ts
const passes = [focus.featured, ...focus.rest].filter(
  (p): p is NonNullable<typeof p> => p !== null,
);

return {
  ok: true,
  snapshot: buildWidgetSnapshot({
    userId: user.id,
    passes,
    total: focus.total,
    date: todayISO(),
    goalMinutes: profile.data?.daily_goal_minutes ?? null,
    todayMinutes: weekly[weekly.length - 1]?.minutes ?? 0,
    streak: streaks.current,
  }),
};
```

- [ ] **Step 2: Typecheck + test**

Run: `npx tsc --noEmit && npm run test -- widgets`
Expected: PASS, sin errores de tipo en `src/lib/widgets`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/widgets/actions.ts
git commit -m "feat(widgets): actions pasa todos los en curso al snapshot v2"
```

---

# FASE 1 — Espejo Kotlin del snapshot v2

### Task 4: `WidgetSnapshot.kt` v2 + parse (TDD JVM)

**Files:**
- Modify: `android/app/src/main/java/app/biblioshare/mobile/widgets/WidgetSnapshot.kt`
- Test: `android/app/src/test/java/app/biblioshare/mobile/widgets/WidgetSnapshotTest.kt`

**Interfaces:**
- Produces: `WIDGET_SCHEMA_VERSION = 2`; `data class WidgetWeekDay(active, today)`; `CurrentProgressData` con los campos ricos; `WidgetSnapshot(version, userId, generatedAt, inProgress: List<CurrentProgressData>, inProgressTotal: Int, dailyGoal)`.

- [ ] **Step 1: Escribir el test que falla**

Añade a `WidgetSnapshotTest.kt` (mira el estilo de los tests existentes):

```kotlin
private fun v2Json() = """
{ "version":2, "userId":"u1", "generatedAt":"2026-08-05T10:00:00Z",
  "inProgressTotal":2, "dailyGoal":null,
  "inProgress":[
    {"passId":"p1","itemType":"book","itemId":"b1","title":"Salitre y Cenizas",
     "subtitle":null,"coverUrl":null,"percentage":25,"progressLabel":"60 de 240 páginas",
     "deepLink":"/sesion/p1","nthLabel":"1.ª lectura","contextLabel":"Día 4 · desde 2/8 · 1 nota",
     "streakDays":3,"kindLabel":"Libro",
     "week":[{"active":false,"today":false},{"active":false,"today":false},
             {"active":false,"today":false},{"active":true,"today":false},
             {"active":true,"today":false},{"active":true,"today":false},
             {"active":true,"today":true}]},
    {"passId":"p2","itemType":"book","itemId":"b2","title":"Siega","subtitle":null,
     "coverUrl":null,"percentage":null,"progressLabel":"Sin progreso","deepLink":"/sesion/p2",
     "nthLabel":"1.ª lectura","contextLabel":"","streakDays":0,"kindLabel":"Libro","week":[]}
  ] }
""".trimIndent()

@Test fun `parsea snapshot v2 con lista de en curso`() {
    val s = WidgetSnapshot.parse(v2Json())!!
    assertEquals(2, s.inProgress.size)
    assertEquals(2, s.inProgressTotal)
    assertEquals("1.ª lectura", s.inProgress[0].nthLabel)
    assertEquals(7, s.inProgress[0].week.size)
    assertTrue(s.inProgress[0].week.last().today)
    assertNull(s.inProgress[1].percentage)
}

@Test fun `descarta version distinta`() {
    assertNull(WidgetSnapshot.parse(v2Json().replace("\"version\":2", "\"version\":1")))
}

@Test fun `inProgress ausente o ilegible degrada a lista vacia`() {
    val s = WidgetSnapshot.parse(
        """{"version":2,"userId":"u1","generatedAt":"x","inProgressTotal":0}""",
    )!!
    assertTrue(s.inProgress.isEmpty())
}
```

- [ ] **Step 2: Ejecutar y ver fallar**

Run (desde `android/`): `./gradlew :app:testDebugUnitTest --tests "*WidgetSnapshotTest*"`
Expected: FAIL (compila mal: campos nuevos inexistentes).

- [ ] **Step 3: Implementar v2**

En `WidgetSnapshot.kt`: `const val WIDGET_SCHEMA_VERSION = 2`. Reemplaza `CurrentProgressData` y `WidgetSnapshot`:

```kotlin
data class WidgetWeekDay(val active: Boolean, val today: Boolean)

data class CurrentProgressData(
    val passId: String,
    val itemType: String,
    val itemId: String,
    val title: String,
    val subtitle: String?,
    val coverUrl: String?,
    val percentage: Int?,
    val progressLabel: String,
    val deepLink: String,
    val nthLabel: String,
    val contextLabel: String,
    val streakDays: Int,
    val week: List<WidgetWeekDay>,
    val kindLabel: String,
)

data class WidgetSnapshot(
    val version: Int,
    val userId: String,
    val generatedAt: String,
    val inProgress: List<CurrentProgressData>,
    val inProgressTotal: Int,
    val dailyGoal: DailyGoalData?,
)
```

Reescribe `parse`:

```kotlin
fun parse(json: String?): WidgetSnapshot? {
    if (json.isNullOrBlank()) return null
    return try {
        val root = JSONObject(json)
        if (root.getInt("version") != WIDGET_SCHEMA_VERSION) return null
        val userId = root.getString("userId")
        if (userId.isBlank()) return null
        WidgetSnapshot(
            version = WIDGET_SCHEMA_VERSION,
            userId = userId,
            generatedAt = root.getString("generatedAt"),
            inProgress = parseInProgress(root.optJSONArray("inProgress")),
            inProgressTotal = root.optInt("inProgressTotal", 0),
            dailyGoal = root.optJSONObject("dailyGoal")?.let(::parseGoal),
        )
    } catch (_: Exception) {
        null
    }
}

private fun parseInProgress(arr: JSONArray?): List<CurrentProgressData> {
    if (arr == null) return emptyList()
    val out = ArrayList<CurrentProgressData>(arr.length())
    for (i in 0 until arr.length()) {
        val o = arr.optJSONObject(i) ?: continue
        out.add(
            CurrentProgressData(
                passId = o.getString("passId"),
                itemType = o.getString("itemType"),
                itemId = o.getString("itemId"),
                title = o.getString("title"),
                subtitle = o.optStringOrNull("subtitle"),
                coverUrl = o.optStringOrNull("coverUrl"),
                percentage = if (o.isNull("percentage")) null else o.getInt("percentage"),
                progressLabel = o.getString("progressLabel"),
                deepLink = o.getString("deepLink"),
                nthLabel = o.optString("nthLabel"),
                contextLabel = o.optString("contextLabel"),
                streakDays = o.optInt("streakDays", 0),
                week = parseWeek(o.optJSONArray("week")),
                kindLabel = o.optString("kindLabel"),
            ),
        )
    }
    return out
}

private fun parseWeek(arr: JSONArray?): List<WidgetWeekDay> {
    if (arr == null) return emptyList()
    return (0 until arr.length()).mapNotNull { i ->
        arr.optJSONObject(i)?.let { WidgetWeekDay(it.optBoolean("active"), it.optBoolean("today")) }
    }
}
```

Añade `import org.json.JSONArray`. (`optStringOrNull` y `parseGoal` ya existen.)

- [ ] **Step 4: Ejecutar y ver pasar**

Run: `./gradlew :app:testDebugUnitTest --tests "*WidgetSnapshotTest*"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add android/app/src/main/java/app/biblioshare/mobile/widgets/WidgetSnapshot.kt android/app/src/test/java/app/biblioshare/mobile/widgets/WidgetSnapshotTest.kt
git commit -m "feat(widgets): WidgetSnapshot v2 en Kotlin (parse lista en curso)"
```

---

### Task 5: Selección de destacado en `WidgetState.kt` (TDD JVM)

**Files:**
- Modify: `android/app/src/main/java/app/biblioshare/mobile/widgets/WidgetState.kt`
- Test: `android/app/src/test/java/app/biblioshare/mobile/widgets/WidgetStateTest.kt`

**Interfaces:**
- Produces: `ProgressWidgetState.Content(items: List<CurrentProgressData>, selectedPassId: String?, total: Int, stale: Boolean)`; helper `Content.featured` (destacado resuelto con fallback); `currentProgressState(snapshot, selectedPassId, now, staleAfterHours)`.

- [ ] **Step 1: Escribir el test que falla**

```kotlin
private fun item(id: String) = CurrentProgressData(
    passId = id, itemType = "book", itemId = "b-$id", title = id, subtitle = null,
    coverUrl = null, percentage = 10, progressLabel = "x", deepLink = "/sesion/$id",
    nthLabel = "1.ª lectura", contextLabel = "", streakDays = 0, week = emptyList(),
    kindLabel = "Libro",
)
private fun snap(vararg ids: String) = WidgetSnapshot(
    2, "u1", "2026-08-05T10:00:00Z", ids.map(::item), ids.size, null,
)

@Test fun `sin seleccion, destacado es el primero`() {
    val s = currentProgressState(snap("p1", "p2"), selectedPassId = null) as ProgressWidgetState.Content
    assertEquals("p1", s.featured.passId)
}

@Test fun `seleccion valida manda`() {
    val s = currentProgressState(snap("p1", "p2"), selectedPassId = "p2") as ProgressWidgetState.Content
    assertEquals("p2", s.featured.passId)
}

@Test fun `seleccion inexistente cae al primero`() {
    val s = currentProgressState(snap("p1", "p2"), selectedPassId = "zzz") as ProgressWidgetState.Content
    assertEquals("p1", s.featured.passId)
}

@Test fun `lista vacia es NothingInProgress`() {
    assertEquals(ProgressWidgetState.NothingInProgress, currentProgressState(snap(), null))
}
```

- [ ] **Step 2: Ejecutar y ver fallar**

Run: `./gradlew :app:testDebugUnitTest --tests "*WidgetStateTest*"`
Expected: FAIL.

- [ ] **Step 3: Implementar**

Sustituye `ProgressWidgetState.Content` y `currentProgressState`:

```kotlin
sealed interface ProgressWidgetState {
    data object SignedOut : ProgressWidgetState
    data object NothingInProgress : ProgressWidgetState
    data class Content(
        val items: List<CurrentProgressData>,
        val selectedPassId: String?,
        val total: Int,
        val stale: Boolean,
    ) : ProgressWidgetState {
        val featured: CurrentProgressData
            get() = items.firstOrNull { it.passId == selectedPassId } ?: items.first()
        val others: List<CurrentProgressData>
            get() = items.filter { it.passId != featured.passId }
    }
}

fun currentProgressState(
    snapshot: WidgetSnapshot?,
    selectedPassId: String?,
    nowMillis: Long = System.currentTimeMillis(),
    staleAfterHours: Int = 48,
): ProgressWidgetState {
    if (snapshot == null) return ProgressWidgetState.SignedOut
    if (snapshot.inProgress.isEmpty()) return ProgressWidgetState.NothingInProgress
    return ProgressWidgetState.Content(
        items = snapshot.inProgress,
        selectedPassId = selectedPassId,
        total = snapshot.inProgressTotal,
        stale = isOlderThanHours(snapshot.generatedAt, staleAfterHours, nowMillis),
    )
}
```

- [ ] **Step 4: Ejecutar y ver pasar**

Run: `./gradlew :app:testDebugUnitTest --tests "*WidgetStateTest*"`
Expected: PASS. (El código en `CurrentProgressWidget.kt` no compilará aún — se arregla en Task 7.)

- [ ] **Step 5: Commit**

```bash
git add android/app/src/main/java/app/biblioshare/mobile/widgets/WidgetState.kt android/app/src/test/java/app/biblioshare/mobile/widgets/WidgetStateTest.kt
git commit -m "feat(widgets): selección de destacado con fallback (v2)"
```

---

# FASE 2 — Widget A · Completo

### Task 6: Helpers de UI compartidos en `WidgetUi.kt`

**Files:**
- Modify: `android/app/src/main/java/app/biblioshare/mobile/widgets/WidgetUi.kt`

**Interfaces:**
- Produces composables: `SectionHeader(label, trailing?)`, `StreakPill(days)`, `WeekDots(week)`, `SoftBar(percent)`. (Reutilizan `WidgetPalette`, estilos existentes.)

- [ ] **Step 1: Añadir helpers**

```kotlin
@Composable
fun StreakPill(days: Int) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = GlanceModifier
            .background(ImageProvider(R.drawable.widget_pill_gold))
            .padding(horizontal = 12.dp, vertical = 5.dp),
    ) {
        Text("◆", style = TextStyle(color = WidgetPalette.gold, fontSize = 11.sp))
        Spacer(GlanceModifier.width(7.dp))
        Text("Racha $days d", style = TextStyle(color = WidgetPalette.fg, fontSize = 12.sp, fontWeight = FontWeight.Medium))
    }
}

@Composable
fun WeekDots(week: List<WidgetWeekDay>) {
    Row {
        week.forEach { d ->
            val bg = when {
                d.today -> R.drawable.widget_dot_today
                d.active -> R.drawable.widget_dot_on
                else -> R.drawable.widget_dot_off
            }
            Box(GlanceModifier.size(14.dp).background(ImageProvider(bg))) {}
            Spacer(GlanceModifier.width(4.dp))
        }
    }
}

@Composable
fun SoftBar(percent: Int, color: ColorProvider = WidgetPalette.accent) {
    Box(GlanceModifier.fillMaxWidth().height(6.dp).background(WidgetPalette.track)) {
        Box(GlanceModifier.fillMaxWidth(percent / 100f).height(6.dp).background(color)) {}
    }
}
```

Añade a `WidgetPalette` el color `gold = ColorProvider(R.color.widget_gold)`. Crea los drawables redondeados (`res/drawable/widget_pill_gold.xml`, `widget_dot_on.xml`, `widget_dot_off.xml`, `widget_dot_today.xml` — `<shape>` con `corners`/`solid`/`stroke`) y el color `widget_gold` en `res/values/colors.xml` + `values-night`. Imports: `androidx.glance.layout.Box`, `size`, `Row`, `Spacer`, `width`, `FontWeight`.

> Nota Glance: `fillMaxWidth(fraction)` puede no existir según versión; si el linter se queja, usa el ancho fijo del contenedor × fracción o un `Row` con `defaultWeight`. Verifica contra la versión de Glance del `build.gradle`.

- [ ] **Step 2: Compilar**

Run (desde `android/`): `./gradlew :app:compileDebugKotlin`
Expected: BUILD SUCCESSFUL (o errores solo por consumidores aún no migrados; si es así continúa a Task 7 y recompila allí).

- [ ] **Step 3: Commit**

```bash
git add android/app/src/main/java/app/biblioshare/mobile/widgets/WidgetUi.kt android/app/src/main/res
git commit -m "feat(widgets): helpers de UI (racha, semana, barra)"
```

---

### Task 7: Composable del Completo + previews

**Files:**
- Modify: `android/app/src/main/java/app/biblioshare/mobile/widgets/CurrentProgressWidget.kt`
- Modify: `android/app/src/debug/java/app/biblioshare/mobile/widgets/WidgetPreviews.kt`

**Interfaces:**
- Consumes: `ProgressWidgetState.Content` (Task 5), helpers (Task 6).
- Produces: `CurrentProgressContent(state, covers: Map<String, Bitmap?>)` donde la clave es `coverUrl`; composable `Completo(...)`.

- [ ] **Step 1: Reescribir el contenido**

Reemplaza `CurrentProgressContent`, `Compact`, `Horizontal`, `ProgressLine` por el layout Completo (un solo tamaño). `provideGlance` se ajusta en Task 9; de momento asume `covers: Map<String, Bitmap?>`:

```kotlin
override val sizeMode = SizeMode.Exact // un solo layout grande

@Composable
fun CurrentProgressContent(state: ProgressWidgetState, covers: Map<String, Bitmap?>) {
    val ctx = LocalContext.current
    when (state) {
        ProgressWidgetState.SignedOut -> WidgetCard("/") {
            EmptyState(ctx.getString(R.string.widget_open_app_title), ctx.getString(R.string.widget_open_app_subtitle))
        }
        ProgressWidgetState.NothingInProgress -> WidgetCard("/coleccion") {
            EmptyState(ctx.getString(R.string.widget_nothing_in_progress), ctx.getString(R.string.widget_open_to_start))
        }
        is ProgressWidgetState.Content -> Completo(state, covers)
    }
}

@Composable
private fun Completo(state: ProgressWidgetState.Content, covers: Map<String, Bitmap?>) {
    val ctx = LocalContext.current
    val f = state.featured
    Column(GlanceModifier.fillMaxSize().padding(4.dp)) {
        SectionHeader(
            label = "En curso",
            trailing = "${state.total} · Ver todos ›",
            onTrailing = actionStartActivity(WidgetDeepLinks.intentFor(ctx, "/coleccion?status=in_progress")),
        )
        Spacer(GlanceModifier.height(10.dp))
        FeaturedCard(f, covers[f.coverUrl], timerRunning = false) // cronómetro: Task 17
        if (state.others.isNotEmpty()) {
            Spacer(GlanceModifier.height(18.dp))
            Text("Continúa donde lo dejaste", style = softStyle())
            Spacer(GlanceModifier.height(8.dp))
            ContinueGrid(state.others, covers) // taps → foco: Task 8
        }
    }
}
```

`FeaturedCard` (portada + ordinal + título + contexto + meta + racha/semana + pie):

```kotlin
@Composable
private fun FeaturedCard(d: CurrentProgressData, cover: Bitmap?, timerRunning: Boolean) {
    val ctx = LocalContext.current
    Column(GlanceModifier.fillMaxWidth().background(WidgetPalette.surface).cornerRadius(18.dp)) {
        Row(GlanceModifier.padding(16.dp)) {
            Cover(cover, width = 72, height = 104)
            Spacer(GlanceModifier.width(14.dp))
            Column(GlanceModifier.defaultWeight()) {
                Text(d.nthLabel, style = TextStyle(color = WidgetPalette.accent, fontSize = 11.sp, fontWeight = FontWeight.Medium))
                Text(d.title, style = bigStyle(), maxLines = 2)
                Text(d.contextLabel.ifBlank { "Sin progreso" }, style = softStyle(), maxLines = 1)
                if (d.streakDays > 0 || d.week.isNotEmpty()) {
                    Spacer(GlanceModifier.height(12.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        if (d.streakDays > 0) { StreakPill(d.streakDays); Spacer(GlanceModifier.defaultWeight()) }
                        WeekDots(d.week)
                    }
                }
            }
        }
        FeaturedActions(d, timerRunning) // Task 17 lo enriquece; por ahora Sesión/Registrar deep-link
    }
}
```

`FeaturedActions` (versión sin cronómetro, se sustituye en Task 17):

```kotlin
@Composable
private fun FeaturedActions(d: CurrentProgressData, timerRunning: Boolean) {
    val ctx = LocalContext.current
    Row(GlanceModifier.fillMaxWidth().padding(top = 4.dp)) {
        if (d.itemType == "book") {
            ActionCell("◷ Sesión", WidgetPalette.accent, GlanceModifier.defaultWeight()
                .clickable(actionStartActivity(WidgetDeepLinks.intentFor(ctx, d.deepLink))))
        }
        ActionCell("✎ Registrar", WidgetPalette.fg, GlanceModifier.defaultWeight()
            .clickable(actionStartActivity(WidgetDeepLinks.intentFor(ctx, "${itemLogHref(d)}"))))
    }
}
```

donde `itemLogHref(d)` = `d.deepLink` si no es libro, o `"/sesion/${d.passId}"` (la hoja) — para «Registrar» sin minutos. Añade helpers `ActionCell`, `SectionHeader`, `ContinueGrid` en `WidgetUi.kt` (rejilla: `Row` con `defaultWeight` por columna, 3 por fila, portada + título). Imports Glance: `cornerRadius`, `background(ColorProvider)`.

> Verifica en la versión de Glance: `GlanceModifier.cornerRadius(Dp)` (existe desde 1.0). `SizeMode.Exact` vs mantener `Responsive` con un único `DpSize` grande — si el widget se redimensiona muy pequeño, `Exact` escala; es aceptable (el mini es el otro widget).

- [ ] **Step 2: Previews**

En `WidgetPreviews.kt` sustituye las previews de progreso por el Completo (tamaño ~380×560):

```kotlin
private val sampleItems = listOf(
    CurrentProgressData("p1","book","b1","Salitre y Cenizas",null,null,25,"60 de 240 páginas",
        "/sesion/p1","1.ª lectura","Día 4 · desde 2/8 · 1 nota",3,
        List(7){ WidgetWeekDay(it in 3..6, it==6) },"Libro"),
    CurrentProgressData("p2","book","b2","Siega",null,null,null,"Sin progreso",
        "/sesion/p2","1.ª lectura","",0,emptyList(),"Libro"),
)
@OptIn(ExperimentalGlancePreviewApi::class)
@Preview(widthDp = 380, heightDp = 560)
@Composable fun PreviewCompleto() {
    CurrentProgressContent(
        ProgressWidgetState.Content(sampleItems, selectedPassId = null, total = 2, stale = false),
        covers = emptyMap(),
    )
}
```

Añade también previews `NothingInProgress` y `SignedOut`.

- [ ] **Step 3: Compilar**

Run: `./gradlew :app:compileDebugKotlin :app:compileDebugUnitTestKotlin`
Expected: BUILD SUCCESSFUL. Abre `WidgetPreviews.kt` en Android Studio (Split) y comprueba visualmente el Completo.

- [ ] **Step 4: Commit**

```bash
git add android/app/src/main/java/app/biblioshare/mobile/widgets/CurrentProgressWidget.kt android/app/src/main/java/app/biblioshare/mobile/widgets/WidgetUi.kt android/app/src/debug/java/app/biblioshare/mobile/widgets/WidgetPreviews.kt
git commit -m "feat(widgets): layout Completo (destacado rico + continúa)"
```

---

### Task 8: Cambio de foco (Glance state + `actionRunCallback`)

**Files:**
- Create: `android/app/src/main/java/app/biblioshare/mobile/widgets/WidgetActions.kt`
- Modify: `CurrentProgressWidget.kt` (state definition + provideGlance lee la selección; `ContinueGrid` cablea taps)

**Interfaces:**
- Produces: `SelectFocusAction : ActionCallback` (param `PASS_ID_KEY`); constante `SELECTED_PASS_KEY` (Preferences).

- [ ] **Step 1: Definir la acción y la clave de estado**

`WidgetActions.kt`:

```kotlin
package app.biblioshare.mobile.widgets

import android.content.Context
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.glance.GlanceId
import androidx.glance.action.ActionParameters
import androidx.glance.appwidget.action.ActionCallback
import androidx.glance.appwidget.state.updateAppWidgetState

val SELECTED_PASS_KEY = stringPreferencesKey("selected_pass_id")
val PASS_ID_PARAM = ActionParameters.Key<String>("passId")

class SelectFocusAction : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        val passId = parameters[PASS_ID_PARAM] ?: return
        updateAppWidgetState(context, glanceId) { it[SELECTED_PASS_KEY] = passId }
        CurrentProgressWidget().update(context, glanceId)
    }
}
```

- [ ] **Step 2: Leer la selección en `provideGlance`**

En `CurrentProgressWidget`:

```kotlin
override val stateDefinition = PreferencesGlanceStateDefinition

override suspend fun provideGlance(context: Context, id: GlanceId) {
    val snapshot = WidgetSnapshotStore.load(context)
    val selected = currentState(context, id)[SELECTED_PASS_KEY] // helper de Glance
    val state = currentProgressState(snapshot, selected)
    val covers = loadCovers(context, snapshot) // Task 9
    provideContent { CurrentProgressContent(state, covers) }
}
```

(`currentState(context, id)` = `getAppWidgetState(context, PreferencesGlanceStateDefinition, id)`; usa el helper disponible en tu versión de Glance.)

- [ ] **Step 3: Cablear los taps de la rejilla**

En `ContinueGrid`, cada portada:

```kotlin
Column(GlanceModifier.clickable(
    actionRunCallback<SelectFocusAction>(actionParametersOf(PASS_ID_PARAM to d.passId)),
)) { Cover(covers[d.coverUrl], 96, 144); Text(d.title, style = titleStyle(), maxLines = 2) }
```

- [ ] **Step 4: Compilar + preview**

Run: `./gradlew :app:compileDebugKotlin`
Expected: BUILD SUCCESSFUL. (El cambio de foco real se prueba en dispositivo, #485; en preview el estado es fijo.)

- [ ] **Step 5: Commit**

```bash
git add android/app/src/main/java/app/biblioshare/mobile/widgets/WidgetActions.kt android/app/src/main/java/app/biblioshare/mobile/widgets/CurrentProgressWidget.kt android/app/src/main/java/app/biblioshare/mobile/widgets/WidgetUi.kt
git commit -m "feat(widgets): tocar 'continúa' cambia el foco (Glance state)"
```

---

### Task 9: Carga de portadas de todos los en curso

**Files:**
- Modify: `CurrentProgressWidget.kt` (`loadCovers`)
- Modify: `BiblioshareWidgetPlugin.kt` (prefetch)

**Interfaces:**
- Produces: `suspend fun loadCovers(context, snapshot): Map<String, Bitmap?>` (clave = `coverUrl`).

- [ ] **Step 1: Implementar `loadCovers`**

```kotlin
private suspend fun loadCovers(context: Context, snapshot: WidgetSnapshot?): Map<String, Bitmap?> {
    val urls = snapshot?.inProgress?.mapNotNull { it.coverUrl }?.distinct().orEmpty()
    return urls.associateWith { WidgetImageCache.loadBitmap(context, it) }
}
```

- [ ] **Step 2: Prefetch de todas las portadas en el plugin**

En `BiblioshareWidgetPlugin.updateSnapshot`, cambia el `Thread { }` para prefetchar todas:

```kotlin
Thread {
    val covers = parsed.inProgress.mapNotNull { it.coverUrl }
    WidgetImageCache.prune(context, covers.toSet())
    var any = false
    covers.forEach { if (WidgetImageCache.ensureDownloaded(context, it)) any = true }
    if (any) WidgetRefresh.updateAll(context)
}.start()
```

Y en `WidgetRefresh.updateAll` añade `QuickRegisterWidget().updateAll(context)` (se crea en Task 11; si aún no existe, déjalo comentado con un TODO de este plan y añádelo al cerrar Task 11).

- [ ] **Step 3: Compilar**

Run: `./gradlew :app:compileDebugKotlin`
Expected: BUILD SUCCESSFUL.

- [ ] **Step 4: Commit**

```bash
git add android/app/src/main/java/app/biblioshare/mobile/widgets/CurrentProgressWidget.kt android/app/src/main/java/app/biblioshare/mobile/widgets/BiblioshareWidgetPlugin.kt
git commit -m "feat(widgets): carga/prefetch de portadas de todos los en curso"
```

---

# FASE 3 — Widget B · Registro rápido (2 pasos)

### Task 10: Estado del reducido (TDD JVM)

**Files:**
- Modify: `WidgetState.kt`
- Test: `WidgetStateTest.kt`

**Interfaces:**
- Produces: `sealed interface QuickRegisterState { SignedOut; NothingInProgress; Pick(items); Register(item) }`; `quickRegisterState(snapshot, step: Int, selectedPassId: String?)`.

- [ ] **Step 1: Test que falla**

```kotlin
@Test fun `paso 1 lista, paso 2 elige por passId`() {
    val s1 = quickRegisterState(snap("p1","p2"), step = 1, selectedPassId = null)
    assertTrue(s1 is QuickRegisterState.Pick && s1.items.size == 2)
    val s2 = quickRegisterState(snap("p1","p2"), step = 2, selectedPassId = "p2")
    assertTrue(s2 is QuickRegisterState.Register && (s2 as QuickRegisterState.Register).item.passId == "p2")
}
@Test fun `paso 2 con seleccion perdida vuelve a lista`() {
    val s = quickRegisterState(snap("p1"), step = 2, selectedPassId = "zzz")
    assertTrue(s is QuickRegisterState.Pick)
}
```

- [ ] **Step 2: Ver fallar** — Run: `./gradlew :app:testDebugUnitTest --tests "*WidgetStateTest*"` → FAIL.

- [ ] **Step 3: Implementar**

```kotlin
sealed interface QuickRegisterState {
    data object SignedOut : QuickRegisterState
    data object NothingInProgress : QuickRegisterState
    data class Pick(val items: List<CurrentProgressData>) : QuickRegisterState
    data class Register(val item: CurrentProgressData) : QuickRegisterState
}

fun quickRegisterState(snapshot: WidgetSnapshot?, step: Int, selectedPassId: String?): QuickRegisterState {
    if (snapshot == null) return QuickRegisterState.SignedOut
    val items = snapshot.inProgress
    if (items.isEmpty()) return QuickRegisterState.NothingInProgress
    val chosen = items.firstOrNull { it.passId == selectedPassId }
    return if (step >= 2 && chosen != null) QuickRegisterState.Register(chosen)
    else QuickRegisterState.Pick(items)
}
```

- [ ] **Step 4: Ver pasar** — Run igual → PASS.

- [ ] **Step 5: Commit**

```bash
git add android/app/src/main/java/app/biblioshare/mobile/widgets/WidgetState.kt android/app/src/test/java/app/biblioshare/mobile/widgets/WidgetStateTest.kt
git commit -m "feat(widgets): estado del widget de registro rápido"
```

---

### Task 11: `QuickRegisterWidget` (composables + previews)

**Files:**
- Create: `android/app/src/main/java/app/biblioshare/mobile/widgets/QuickRegisterWidget.kt`
- Modify: `WidgetUi.kt` (fila compacta, chips)
- Modify: `WidgetPreviews.kt`

**Interfaces:**
- Consumes: `QuickRegisterState` (Task 10). Constantes de estado `STEP_KEY`, `QR_SELECTED_KEY`, `QR_MINUTES_KEY` (Task 12).
- Produces: `class QuickRegisterWidget : GlanceAppWidget`, `QuickRegisterContent(state, covers, selectedMinutes)`.

- [ ] **Step 1: Composable**

```kotlin
class QuickRegisterWidget : GlanceAppWidget() {
    override val stateDefinition = PreferencesGlanceStateDefinition
    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val snapshot = WidgetSnapshotStore.load(context)
        val prefs = currentState(context, id)
        val state = quickRegisterState(snapshot, prefs[STEP_KEY] ?: 1, prefs[QR_SELECTED_KEY])
        val covers = loadCovers(context, snapshot)
        provideContent { QuickRegisterContent(state, covers, prefs[QR_MINUTES_KEY] ?: 30) }
    }
}
class QuickRegisterWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = QuickRegisterWidget()
}

@Composable
fun QuickRegisterContent(state: QuickRegisterState, covers: Map<String, Bitmap?>, minutes: Int) {
    when (state) {
        QuickRegisterState.SignedOut -> WidgetCard("/") { EmptyState(/* abrir app */) }
        QuickRegisterState.NothingInProgress -> WidgetCard("/coleccion") { EmptyState(/* nada en curso */) }
        is QuickRegisterState.Pick -> PickStep(state.items, covers)
        is QuickRegisterState.Register -> RegisterStep(state.item, covers[state.item.coverUrl], minutes)
    }
}
```

`PickStep`: cabecera `Registrar lectura` + `{n} en curso`; por ítem, `CompactRow(item, covers[...], onClick = actionRunCallback<PickAction>(passId))` (fila: portada 36×54 + kindLabel + título + `SoftBar(percentage)` o «Sin progreso»).

`RegisterStep`: cabecera con «‹» (`actionRunCallback<BackAction>`) + `Registrar`; ficha (portada 64×96 + nthLabel + título + contextLabel/«Primera sesión»); si `itemType=="book"` → fila de chips 15/30/45/Otro (`actionRunCallback<PickMinutesAction>`, `minutes` marca el activo) + botón **Guardar sesión** (deep-link, Task 13); si no es libro → único botón «Abrir para registrar» → `d.deepLink`.

- [ ] **Step 2: Previews** (paso 1 y paso 2 book, ~340×420 y ~340×360). Reusa `sampleItems`.

- [ ] **Step 3: Compilar + preview**

Run: `./gradlew :app:compileDebugKotlin`
Expected: BUILD SUCCESSFUL. Verifica ambos pasos en Android Studio. Descomenta `QuickRegisterWidget().updateAll(context)` en `WidgetRefresh` (Task 9).

- [ ] **Step 4: Commit**

```bash
git add android/app/src/main/java/app/biblioshare/mobile/widgets/QuickRegisterWidget.kt android/app/src/main/java/app/biblioshare/mobile/widgets/WidgetUi.kt android/app/src/main/java/app/biblioshare/mobile/widgets/BiblioshareWidgetPlugin.kt android/app/src/debug/java/app/biblioshare/mobile/widgets/WidgetPreviews.kt
git commit -m "feat(widgets): widget de registro rápido (2 pasos)"
```

---

### Task 12: Acciones de pasos (Glance state)

**Files:**
- Modify: `WidgetActions.kt`

**Interfaces:**
- Produces: `STEP_KEY`, `QR_SELECTED_KEY`, `QR_MINUTES_KEY` (Preferences); `PickAction`, `BackAction`, `PickMinutesAction` (`MINUTES_PARAM`).

- [ ] **Step 1: Implementar acciones**

```kotlin
val STEP_KEY = intPreferencesKey("qr_step")
val QR_SELECTED_KEY = stringPreferencesKey("qr_selected")
val QR_MINUTES_KEY = intPreferencesKey("qr_minutes")
val MINUTES_PARAM = ActionParameters.Key<Int>("minutes")

class PickAction : ActionCallback {
    override suspend fun onAction(c: Context, id: GlanceId, p: ActionParameters) {
        val passId = p[PASS_ID_PARAM] ?: return
        updateAppWidgetState(c, id) { it[QR_SELECTED_KEY] = passId; it[STEP_KEY] = 2; it[QR_MINUTES_KEY] = 30 }
        QuickRegisterWidget().update(c, id)
    }
}
class BackAction : ActionCallback {
    override suspend fun onAction(c: Context, id: GlanceId, p: ActionParameters) {
        updateAppWidgetState(c, id) { it[STEP_KEY] = 1 }
        QuickRegisterWidget().update(c, id)
    }
}
class PickMinutesAction : ActionCallback {
    override suspend fun onAction(c: Context, id: GlanceId, p: ActionParameters) {
        updateAppWidgetState(c, id) { it[QR_MINUTES_KEY] = p[MINUTES_PARAM] ?: 30 }
        QuickRegisterWidget().update(c, id)
    }
}
```

Imports: `intPreferencesKey`. Cablea estas acciones en `QuickRegisterWidget` (Task 11) donde quedaron los `actionRunCallback<...>`.

- [ ] **Step 2: Compilar** — Run: `./gradlew :app:compileDebugKotlin` → BUILD SUCCESSFUL.

- [ ] **Step 3: Commit**

```bash
git add android/app/src/main/java/app/biblioshare/mobile/widgets/WidgetActions.kt android/app/src/main/java/app/biblioshare/mobile/widgets/QuickRegisterWidget.kt
git commit -m "feat(widgets): pasos del registro rápido (elegir/volver/minutos)"
```

---

### Task 13: «Guardar» abre la app + registro del widget en el manifiesto

**Files:**
- Modify: `QuickRegisterWidget.kt` (botón Guardar)
- Create: `android/app/src/main/res/xml/quick_register_widget_info.xml`
- Modify: `android/app/src/main/AndroidManifest.xml`

- [ ] **Step 1: Botón Guardar → deep-link con minutos**

En `RegisterStep`, «Guardar sesión»:

```kotlin
val ctx = LocalContext.current
val href = "/sesion/${d.passId}?minutos=$minutes"
Text("Guardar sesión", style = /* botón acento */, modifier = GlanceModifier
    .fillMaxWidth().clickable(actionStartActivity(WidgetDeepLinks.intentFor(ctx, href))))
```

(«Otro» pone `minutes = 0`; construye el href sin `?minutos` cuando `minutes <= 0`.)

- [ ] **Step 2: Provider info**

`res/xml/quick_register_widget_info.xml` (copia `current_progress_widget_info.xml` — busca el existente — y ajusta `minWidth/minHeight`, p. ej. 250dp × 180dp, `initialLayout` al glance loading, `resizeMode="horizontal|vertical"`, `previewImage`/`description` propios en strings).

- [ ] **Step 3: Receiver en el manifiesto**

En `AndroidManifest.xml`, junto al receiver de `CurrentProgressWidgetReceiver`, añade:

```xml
<receiver android:name=".widgets.QuickRegisterWidgetReceiver" android:exported="false">
    <intent-filter>
        <action android:name="android.appwidget.action.APPWIDGET_UPDATE" />
    </intent-filter>
    <meta-data android:name="android.appwidget.provider"
        android:resource="@xml/quick_register_widget_info" />
</receiver>
```

- [ ] **Step 4: Build del APK debug (verificación de manifiesto/recursos)**

Run: `./gradlew :app:assembleDebug`
Expected: BUILD SUCCESSFUL. (Recuerda `npx cap sync android` antes si el worktree no tiene `cordova.variables.gradle` — ver memoria de widgets.)

- [ ] **Step 5: Commit**

```bash
git add android/app/src/main/java/app/biblioshare/mobile/widgets/QuickRegisterWidget.kt android/app/src/main/res/xml/quick_register_widget_info.xml android/app/src/main/AndroidManifest.xml android/app/src/main/res/values
git commit -m "feat(widgets): registrar rápido abre la app rellena + registro del widget"
```

---

# FASE 4 — Cronómetro nativo (Completo · Sesión)

### Task 14: `TimerStore` (TDD JVM)

**Files:**
- Create: `android/app/src/main/java/app/biblioshare/mobile/widgets/TimerStore.kt`
- Test: `android/app/src/test/java/app/biblioshare/mobile/widgets/TimerStoreTest.kt`

**Interfaces:**
- Produces: `object TimerStore { data class Running(passId, startedAt); set(ctx, passId, startedAt); get(ctx): Running?; clear(ctx, passId?) }`. Persiste en el mismo `SharedPreferences` `biblioshare_widgets`.

- [ ] **Step 1: Test (Robolectric o `SharedPreferences` falso)**

> Nota: `SharedPreferences` real necesita `Context`. Usa Robolectric si el proyecto ya lo trae; si NO (el resto de tests son JVM puro), extrae la lógica a funciones puras sobre un `Map<String,String>` y testéalas, y deja `TimerStore` como fino wrapper de esas puras. Elige lo que no meta dependencias nuevas — revisa `android/app/build.gradle`.

Test de la lógica pura (`WidgetTimer` — Task 15 comparte fichero de test si prefieres):

```kotlin
@Test fun `roundtrip set-get-clear`() {
    val m = HashMap<String,String>()
    TimerLogic.set(m, "p1", 1000L)
    assertEquals(TimerLogic.Running("p1", 1000L), TimerLogic.get(m))
    TimerLogic.clear(m, "p1")
    assertNull(TimerLogic.get(m))
}
@Test fun `clear de otro pase no borra`() {
    val m = HashMap<String,String>(); TimerLogic.set(m, "p1", 1L)
    TimerLogic.clear(m, "p2")
    assertNotNull(TimerLogic.get(m))
}
```

- [ ] **Step 2: Ver fallar** → Run: `./gradlew :app:testDebugUnitTest --tests "*Timer*"` → FAIL.

- [ ] **Step 3: Implementar `TimerLogic` (puro) + `TimerStore` (wrapper)**

```kotlin
object TimerLogic {
    data class Running(val passId: String, val startedAt: Long)
    fun set(m: MutableMap<String,String>, passId: String, startedAt: Long) {
        m["timer_pass_id"] = passId; m["timer_started_at"] = startedAt.toString()
    }
    fun get(m: Map<String,String>): Running? {
        val id = m["timer_pass_id"] ?: return null
        val at = m["timer_started_at"]?.toLongOrNull() ?: return null
        return Running(id, at)
    }
    fun clear(m: MutableMap<String,String>, passId: String?) {
        if (passId == null || m["timer_pass_id"] == passId) { m.remove("timer_pass_id"); m.remove("timer_started_at") }
    }
}

object TimerStore {
    private fun prefs(c: Context) = c.getSharedPreferences("biblioshare_widgets", Context.MODE_PRIVATE)
    fun get(c: Context): TimerLogic.Running? {
        val p = prefs(c)
        return TimerLogic.get(mapOf(
            "timer_pass_id" to (p.getString("timer_pass_id", null) ?: return null),
            "timer_started_at" to (p.getString("timer_started_at", "") ?: ""),
        ))
    }
    fun set(c: Context, passId: String, startedAt: Long) =
        prefs(c).edit().putString("timer_pass_id", passId).putString("timer_started_at", startedAt.toString()).apply()
    fun clear(c: Context, passId: String?) {
        if (passId != null && prefs(c).getString("timer_pass_id", null) != passId) return
        prefs(c).edit().remove("timer_pass_id").remove("timer_started_at").apply()
    }
}
```

En `WidgetSnapshotStore.save`, cuando cambia el `userId`, añade `TimerStore.clear(context, null)` (higiene de cuenta).

- [ ] **Step 4: Ver pasar** → Run igual → PASS.

- [ ] **Step 5: Commit**

```bash
git add android/app/src/main/java/app/biblioshare/mobile/widgets/TimerStore.kt android/app/src/test/java/app/biblioshare/mobile/widgets/TimerStoreTest.kt android/app/src/main/java/app/biblioshare/mobile/widgets/WidgetSnapshotStore.kt
git commit -m "feat(widgets): TimerStore nativo del cronómetro"
```

---

### Task 15: Cálculo del cronómetro (TDD JVM)

**Files:**
- Create: `android/app/src/main/java/app/biblioshare/mobile/widgets/WidgetTimer.kt`
- Test: `android/app/src/test/java/app/biblioshare/mobile/widgets/WidgetTimerTest.kt`

**Interfaces:**
- Produces: `fun elapsedMinutes(startedAt, now): Int`; `fun isLongSession(startedAt, now): Boolean` (>4h); `fun chronometerBase(startedAt, now, elapsedRealtime): Long`.

- [ ] **Step 1: Test**

```kotlin
@Test fun `minutos redondeados`() {
    assertEquals(30, elapsedMinutes(0L, 30 * 60_000L))
    assertEquals(1, elapsedMinutes(0L, 40_000L)) // 40s → 1 min
}
@Test fun `sesion larga > 4h`() {
    assertFalse(isLongSession(0L, 3 * 3_600_000L))
    assertTrue(isLongSession(0L, 5 * 3_600_000L))
}
@Test fun `base del chronometer resta el transcurrido`() {
    assertEquals(9_000L, chronometerBase(startedAt = 1_000L, now = 2_000L, elapsedRealtime = 10_000L))
}
```

- [ ] **Step 2: Ver fallar** → FAIL.

- [ ] **Step 3: Implementar**

```kotlin
private const val LONG_MS = 4L * 60 * 60 * 1000
fun elapsedMinutes(startedAt: Long, now: Long): Int = Math.round((now - startedAt) / 60_000.0).toInt()
fun isLongSession(startedAt: Long, now: Long): Boolean = now - startedAt > LONG_MS
fun chronometerBase(startedAt: Long, now: Long, elapsedRealtime: Long): Long =
    elapsedRealtime - (now - startedAt)
```

- [ ] **Step 4: Ver pasar** → PASS.

- [ ] **Step 5: Commit**

```bash
git add android/app/src/main/java/app/biblioshare/mobile/widgets/WidgetTimer.kt android/app/src/test/java/app/biblioshare/mobile/widgets/WidgetTimerTest.kt
git commit -m "feat(widgets): cálculo puro del cronómetro (minutos/base/stale)"
```

---

### Task 16: Acciones nativas del cronómetro

**Files:**
- Modify: `WidgetActions.kt`

**Interfaces:**
- Produces: `StartTimerAction`, `DiscardTimerAction`, `RegisterTimerAction` (`ActionCallback`).

- [ ] **Step 1: Implementar**

```kotlin
class StartTimerAction : ActionCallback {
    override suspend fun onAction(c: Context, id: GlanceId, p: ActionParameters) {
        val passId = p[PASS_ID_PARAM] ?: return
        TimerStore.set(c, passId, System.currentTimeMillis())
        CurrentProgressWidget().update(c, id)
    }
}
class DiscardTimerAction : ActionCallback {
    override suspend fun onAction(c: Context, id: GlanceId, p: ActionParameters) {
        TimerStore.clear(c, p[PASS_ID_PARAM])
        CurrentProgressWidget().update(c, id)
    }
}
class RegisterTimerAction : ActionCallback {
    override suspend fun onAction(c: Context, id: GlanceId, p: ActionParameters) {
        val r = TimerStore.get(c) ?: return
        val minutos = elapsedMinutes(r.startedAt, System.currentTimeMillis())
        val inicio = java.time.Instant.ofEpochMilli(r.startedAt).toString()
        TimerStore.clear(c, r.passId)
        val href = "/sesion/${r.passId}?minutos=$minutos&inicio=$inicio"
        c.startActivity(WidgetDeepLinks.intentFor(c, href))
    }
}
```

- [ ] **Step 2: Compilar** → BUILD SUCCESSFUL.

- [ ] **Step 3: Commit**

```bash
git add android/app/src/main/java/app/biblioshare/mobile/widgets/WidgetActions.kt
git commit -m "feat(widgets): acciones nativas del cronómetro (start/discard/register)"
```

---

### Task 17: Reloj vivo en la tarjeta (`Chronometer` + `AndroidRemoteViews`)

**Files:**
- Create: `android/app/src/main/res/layout/widget_chronometer.xml`
- Modify: `CurrentProgressWidget.kt` (`provideGlance` lee `TimerStore`; `FeaturedActions` pinta reloj)

**Interfaces:**
- Consumes: `TimerStore`, `chronometerBase`, `isLongSession` (Tasks 14–15).

- [ ] **Step 1: Layout del Chronometer**

`res/layout/widget_chronometer.xml`:

```xml
<Chronometer xmlns:android="http://schemas.android.com/apk/res/android"
    android:id="@+id/widget_chrono"
    android:layout_width="wrap_content" android:layout_height="wrap_content"
    android:textColor="@color/widget_accent" android:textSize="24sp"
    android:fontFamily="monospace" android:format="%s" />
```

- [ ] **Step 2: Pasar el timer a la composición**

En `provideGlance`, tras cargar el snapshot: `val running = TimerStore.get(context)`. Pásalo a `CurrentProgressContent` → `Completo` → `FeaturedCard(f, cover, running)`.

En `FeaturedActions`, si `running?.passId == d.passId`:

```kotlin
if (running != null && running.passId == d.passId) {
    val now = System.currentTimeMillis()
    if (isLongSession(running.startedAt, now)) {
        Text("Sesión larga · ábrela para registrar", style = softStyle(),
            modifier = GlanceModifier.clickable(actionRunCallback<RegisterTimerAction>()))
    } else {
        Column {
            val rv = RemoteViews(ctx.packageName, R.layout.widget_chronometer).apply {
                setChronometer(R.id.widget_chrono, chronometerBase(running.startedAt, now, SystemClock.elapsedRealtime()), null, true)
            }
            AndroidRemoteViews(rv)
            Row {
                ActionCell("Descartar", WidgetPalette.fgSoft, GlanceModifier.defaultWeight()
                    .clickable(actionRunCallback<DiscardTimerAction>(actionParametersOf(PASS_ID_PARAM to d.passId))))
                ActionCell("Registrar", WidgetPalette.accent, GlanceModifier.defaultWeight()
                    .clickable(actionRunCallback<RegisterTimerAction>()))
            }
        }
    }
} else {
    // Sesión (solo libro) + Registrar, como en Task 7
}
```

y el botón **Sesión** pasa a `actionRunCallback<StartTimerAction>(actionParametersOf(PASS_ID_PARAM to d.passId))`.

> Verifica en tu versión de Glance: `AndroidRemoteViews(remoteViews)` (composable de `androidx.glance.appwidget`). Imports: `android.widget.RemoteViews`, `android.os.SystemClock`, `androidx.glance.appwidget.AndroidRemoteViews`.

- [ ] **Step 3: Compilar + preview con reloj**

Añade en `WidgetPreviews.kt` una preview con `running` simulado (pásalo como parámetro a un `Completo` de preview, o factoriza `FeaturedCard` para aceptar un `elapsedMs` fijo en preview, ya que `Chronometer` no tickea en el panel).
Run: `./gradlew :app:compileDebugKotlin` → BUILD SUCCESSFUL.

- [ ] **Step 4: Commit**

```bash
git add android/app/src/main/res/layout/widget_chronometer.xml android/app/src/main/java/app/biblioshare/mobile/widgets/CurrentProgressWidget.kt android/app/src/debug/java/app/biblioshare/mobile/widgets/WidgetPreviews.kt
git commit -m "feat(widgets): reloj vivo en el Completo (Chronometer nativo)"
```

---

### Task 18: Métodos del plugin para el cronómetro

**Files:**
- Modify: `BiblioshareWidgetPlugin.kt`

**Interfaces:**
- Produces (JS bridge): `getRunningTimer(): {passId, startedAt}|null`; `setRunningTimer({passId, startedAt})`; `clearRunningTimer({passId})`.

- [ ] **Step 1: Añadir métodos**

```kotlin
@PluginMethod fun getRunningTimer(call: PluginCall) {
    val r = TimerStore.get(context)
    val res = JSObject()
    if (r == null) { res.put("timer", JSObject.NULL) }
    else { res.put("timer", JSObject().put("passId", r.passId).put("startedAt", r.startedAt)) }
    call.resolve(res)
}
@PluginMethod fun setRunningTimer(call: PluginCall) {
    val passId = call.getString("passId"); val startedAt = call.getLong("startedAt")
    if (passId == null || startedAt == null) { call.reject("passId/startedAt requeridos"); return }
    TimerStore.set(context, passId, startedAt); WidgetRefresh.updateAll(context); call.resolve()
}
@PluginMethod fun clearRunningTimer(call: PluginCall) {
    TimerStore.clear(context, call.getString("passId")); WidgetRefresh.updateAll(context); call.resolve()
}
```

Imports: `com.getcapacitor.JSObject`. (Verifica `call.getLong` en tu versión de Capacitor; si no existe, usa `call.getString("startedAt")?.toLong()`.)

- [ ] **Step 2: Compilar** → `./gradlew :app:compileDebugKotlin` → BUILD SUCCESSFUL.

- [ ] **Step 3: Commit**

```bash
git add android/app/src/main/java/app/biblioshare/mobile/widgets/BiblioshareWidgetPlugin.kt
git commit -m "feat(widgets): métodos de plugin para el cronómetro nativo"
```

---

### Task 19: Puente TS + espejo en `timer.ts` + siembra al abrir

**Files:**
- Modify: `src/lib/native/android-widgets.ts`
- Modify: `src/lib/sessions/timer.ts`
- Create: `src/lib/native/widget-timer-bootstrap.ts`

**Interfaces:**
- Consumes: métodos del plugin (Task 18).
- Produces: `setRunningTimer(passId, startedAt)`, `clearRunningTimer(passId)`, `getRunningTimer()`; `seedTimerFromWidget()`.

- [ ] **Step 1: Envolturas del plugin**

En `android-widgets.ts` (mira cómo se llama al plugin `BiblioshareWidget` para `updateSnapshot`), añade:

```ts
export async function setRunningTimer(passId: string, startedAt: number): Promise<void> {
  await plugin.setRunningTimer({ passId, startedAt });
}
export async function clearRunningTimer(passId: string): Promise<void> {
  await plugin.clearRunningTimer({ passId });
}
export async function getRunningTimer(): Promise<{ passId: string; startedAt: number } | null> {
  const { timer } = await plugin.getRunningTimer();
  return timer ?? null;
}
```

- [ ] **Step 2: Espejo app→nativo en `timer.ts`**

En `writeTimer`, tras `emit()`:

```ts
mirrorToWidget("write", passId, state);
```

y en `clearTimer`, tras `emit()`: `mirrorToWidget("clear", passId);`. Define abajo (guarda de plataforma + import dinámico, como `sync.ts`):

```ts
function mirrorToWidget(op: "write" | "clear", passId: string, state?: TimerState): void {
  if (typeof window === "undefined") return;
  void (async () => {
    try {
      const { Capacitor } = await import("@capacitor/core");
      if (Capacitor.getPlatform() !== "android") return;
      const w = await import("@/lib/native/android-widgets");
      if (op === "clear" || !state || state.startedAt === null) {
        await w.clearRunningTimer(passId); // pausa/cierre → el widget no modela pausa (ceiling)
      } else {
        await w.setRunningTimer(passId, state.firstStartedAt ?? state.startedAt);
      }
    } catch { /* best-effort: el reloj de la app no depende de esto */ }
  })();
}
```

(No rompe `timer.test.ts`: `window` no existe en JSDOM salvo config; si el test define `window`, el `import("@capacitor/core")` se resuelve a no-android y sale. Verifica ejecutando el test.)

- [ ] **Step 3: Siembra nativo→app al abrir**

`widget-timer-bootstrap.ts`:

```ts
"use client";
import { readTimer, writeTimer, hasTime } from "@/lib/sessions/timer";

export async function seedTimerFromWidget(): Promise<void> {
  if (typeof window === "undefined") return;
  const { Capacitor } = await import("@capacitor/core");
  if (Capacitor.getPlatform() !== "android") return;
  const { getRunningTimer } = await import("@/lib/native/android-widgets");
  const running = await getRunningTimer();
  if (!running) return;
  if (hasTime(readTimer(running.passId))) return; // la app ya tiene reloj: manda el suyo
  writeTimer(running.passId, { startedAt: running.startedAt, accumulatedMs: 0, firstStartedAt: running.startedAt });
}
```

Engánchalo donde la app ya reacciona al arranque/`resume` nativo (busca el listener de `App`/Capacitor o el punto donde se dispara `requestWidgetSync`; llama `void seedTimerFromWidget()` allí, en `resume` y en el primer montaje).

- [ ] **Step 4: Typecheck + tests TS**

Run: `npx tsc --noEmit && npm run test -- timer`
Expected: PASS (o ajusta el guard de `mirrorToWidget` si `timer.test.ts` define `window`).

- [ ] **Step 5: Commit**

```bash
git add src/lib/native/android-widgets.ts src/lib/sessions/timer.ts src/lib/native/widget-timer-bootstrap.ts
git commit -m "feat(widgets): sincroniza el cronómetro nativo con la app (espejo + siembra)"
```

---

# FASE 5 — Cierre

### Task 20: Strings, verificación completa, docs e issues

**Files:**
- Modify: `android/app/src/main/res/values/strings.xml` (+ `values-night` si aplica)
- Modify: `docs/requirements/backlog.md`, memoria de widgets
- Issues nuevas (gh)

- [ ] **Step 1: Strings del reducido**

Añade a `strings.xml` los textos que usen los `EmptyState`/descripciones del `QuickRegisterWidget` (título/descr del provider, «Registrar lectura», «en curso», «Guardar sesión», «Abrir para registrar», «Primera sesión», «Sin progreso», «Sesión larga · ábrela para registrar»). Reusa los `widget_*` existentes donde encajen.

- [ ] **Step 2: Suite completa sin emulador**

Run:
```bash
npm run test -- widgets timer
```
```bash
cd android && ./gradlew :app:testDebugUnitTest && ./gradlew :app:assembleDebug
```
Expected: verde en ambos. Guarda la salida a fichero si hay fallos (evita truncado de `Select-Object`, ver memoria).

- [ ] **Step 3: Doc «hecho» (AGENTS.md)**

- `backlog.md`: marca la casilla del widget si existe (no la fuerces si no).
- Memoria de widgets: anota esquema v2, dos widgets, cambio de foco, cronómetro nativo + regla de los dos relojes.
- No hay cambios de esquema BD → `data-model.md` intacto.

- [ ] **Step 4: Abrir issues (backlog operativo)**

```bash
gh issue create --label "area:ui,tipo:deuda,P2" --title "Widget: el cronómetro nativo no modela la pausa" --body "Al pausar en la app se espeja como clearRunningTimer; el widget vuelve a «Sesión». Aceptado como ceiling (con la app abierta el usuario mira la app). Ver spec 2026-08-05."
```
```bash
gh issue create --label "area:ui,tipo:cobertura,P2" --title "Widget: verificar en dispositivo la sync dos-vías nativo↔WebView" --body "Siembra al abrir + espejo app→nativo + cronómetro vivo sólo se prueban en dispositivo. Complementa #485."
```

- [ ] **Step 5: Commit**

```bash
git add android/app/src/main/res docs
git commit -m "chore(widgets): strings, docs y cierre de la feature"
```

---

## Self-Review (cobertura del spec)

- Snapshot v2 (`inProgress[]`, campos ricos, meta global) → Tasks 1–5. ✓
- Widget A Completo (heading, destacado rico, rejilla) → Tasks 6–7. ✓
- Cambio de foco sin navegar (Glance state) → Task 8. ✓
- Portadas de todos los en curso → Task 9. ✓
- Widget B 2 pasos (elegir → registro rápido, back, chips, series sin chips) → Tasks 10–13. ✓
- Guardar abre la app rellena → Task 13; Registrar del cronómetro → Task 16. ✓
- Cronómetro nativo (TimerStore, cálculo, acciones, reloj vivo, plugin, espejo+siembra) → Tasks 14–19. ✓
- Películas fuera de alcance → cubierto por la rama «no-libro» (Tasks 7, 11). ✓
- Dos receivers/manifiesto → Task 13. ✓
- Tests sin emulador + docs + issues → Task 20. ✓

**Notas de verificación de API (revisar contra la versión de Glance/Capacitor en `android/app/build.gradle` al implementar):** `SizeMode.Exact`, `GlanceModifier.cornerRadius/background(ImageProvider)`, `fillMaxWidth(fraction)`, `PreferencesGlanceStateDefinition` + `currentState`/`getAppWidgetState`, `actionRunCallback`/`ActionParameters`, `AndroidRemoteViews`, `setChronometer`, `call.getLong`. Ninguna es exótica; sólo confirma la firma exacta.
