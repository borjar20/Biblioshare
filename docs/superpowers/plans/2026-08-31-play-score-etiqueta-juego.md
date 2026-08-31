# Etiqueta de juego en puntuación — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** La herramienta de puntuación gana una etiqueta opcional de juego («UNO», «dominó») que viaja en el log (`gameName` en setup + evento `game_labeled`), llega al summary y se ve en setup (con chips de anteriores), tablero, resumen e historial.

**Architecture:** El log manda: `ScoreSetup.gameName?` va dentro de `game_started`, y cambiarla después es un evento `game_labeled` que el reducer acepta incluso con la partida terminada (excepción explícita: etiquetar no es jugar). `summarize` copia `tool.gameName`; cero migraciones (todo viaja en jsonb existentes). Spec: `docs/superpowers/specs/2026-08-31-play-score-etiqueta-juego-design.md`.

**Tech Stack:** motor de eventos de Play, React (islas), vitest, Playwright.

## Global Constraints

- `game_labeled` SOLO existe en score; mtg no cambia. `trim()` en la UI al emitir; cadena vacía = quitar etiqueta (`gameName: undefined`).
- El summary se deriva SIEMPRE del estado (nunca edición a mano del registro guardado).
- Sin migraciones IDB ni SQL. Partidas viejas sin `gameName` funcionan igual (todo opcional).
- Chips derivados del historial local (`listSaved`), también para anon; sin entidad ni sync nuevos.
- Tests: `fnm use 22`. Git: rutas explícitas, nunca `-A`. i18n solo `messages/es.json`.
- Agrupación case-insensitive de stats: DIFERIDA (se anota en decisiones.md, sin código hoy).

---

### Task 1: Dominio score — `gameName`, evento `game_labeled`, summarize

**Files:**
- Modify: `src/lib/play/score/types.ts` (ScoreSetup)
- Modify: `src/lib/play/score/events.ts` (evento + mapa)
- Modify: `src/lib/play/score/reducer.ts` (guard de finished + case nuevo)
- Modify: `src/lib/play/score/selectors.ts` (describeEvent)
- Modify: `src/lib/play/tools.ts` (`summarizeScore` → `tool.gameName`)
- Test: `src/lib/play/score/reducer.test.ts`, `src/lib/play/score/selectors.test.ts`, `src/lib/play/tools.test.ts`

**Interfaces:**
- Produces: `ScoreSetup.gameName?: string`; `GameLabeledEvent = PlayEvent<"game_labeled", { gameName: string }>`; claves de log `labeled`/`unlabeled`; `summary.tool.gameName: string | null`. Los usan Tasks 2–4.

- [ ] **Step 1: Tests que fallan** — en `reducer.test.ts` (usar los helpers de participantes/eventos del fichero):

```ts
describe("game_labeled", () => {
  it("fija la etiqueta con la partida activa", () => {
    const state = scoreReducer(started(2), makeEvent("game_labeled", { gameName: "UNO" }, 2000));
    expect(state.setup.gameName).toBe("UNO");
  });

  it("también con la partida TERMINADA (excepción: etiquetar no es jugar)", () => {
    const finished = scoreReducer(started(2), makeEvent("game_finished", { reason: "manual" }, 2000));
    const labeled = scoreReducer(finished, makeEvent("game_labeled", { gameName: "dominó" }, 3000));
    expect(labeled.setup.gameName).toBe("dominó");
    expect(labeled.status).toBe("finished"); // etiquetar no revive nada
  });

  it("cadena vacía QUITA la etiqueta", () => {
    const withLabel = scoreReducer(started(2), makeEvent("game_labeled", { gameName: "UNO" }, 2000));
    const cleared = scoreReducer(withLabel, makeEvent("game_labeled", { gameName: "" }, 3000));
    expect(cleared.setup.gameName).toBeUndefined();
  });

  it("cualquier OTRO evento sobre terminada sigue rechazándose", () => {
    const finished = scoreReducer(started(2), makeEvent("game_finished", { reason: "manual" }, 2000));
    expect(() => scoreReducer(finished, makeEvent("round_scored", { scores: [1, 1] }, 3000))).toThrow();
  });
});
```

En `selectors.test.ts`: `describeEvent(game_labeled con "UNO") → { key: "labeled", params: { gameName: "UNO" } }`; con `""` → `{ key: "unlabeled", params: {} }`. En `tools.test.ts`: un log score con `game_labeled` («UNO») antes de guardar → `buildSavedSummary(...).tool.gameName === "UNO"`; sin etiqueta → `null`.

- [ ] **Step 2: Ver fallar**: `fnm use 22; npx vitest run src/lib/play/score src/lib/play/tools.test.ts` — FAIL.

- [ ] **Step 3: Implementar**:

`types.ts` — en `ScoreSetup`:

```ts
  /** A qué se juega («UNO», «dominó»…). Opcional, texto libre con trim de la
   * UI; diferencia las stats futuras dentro de la herramienta genérica. */
  gameName?: string;
```

`events.ts` — tras `GameFinishedEvent`:

```ts
// Etiquetar el juego («UNO») en cualquier momento, TAMBIÉN con la partida
// terminada (el caso principal es el resumen). "" = quitar la etiqueta.
export type GameLabeledEvent = PlayEvent<"game_labeled", { gameName: string }>;
```

unión + `game_labeled: true` en el mapa.

`reducer.ts` — el guard de finished deja pasar la etiqueta, y case nuevo:

```ts
  // Excepción única al candado de finished: etiquetar no es jugar, y el caso
  // principal es ponerle nombre al juego desde el RESUMEN (spec etiqueta §2).
  if (state.status === "finished" && event.type !== "game_labeled") {
    throw new PlayEventError(`evento ${event.type} sobre una partida terminada`);
  }
  switch (event.type) {
    ...
    case "game_labeled": {
      const gameName = event.payload.gameName === "" ? undefined : event.payload.gameName;
      return { ...state, setup: { ...state.setup, gameName } };
    }
```

`selectors.ts` — en `describeEvent`:

```ts
    case "game_labeled":
      return event.payload.gameName === ""
        ? { key: "unlabeled", params: {} }
        : { key: "labeled", params: { gameName: event.payload.gameName } };
```

`tools.ts` — en `summarizeScore`, dentro de `tool`:

```ts
      gameName: state.setup.gameName ?? null,
```

- [ ] **Step 4: Verde**: `npx vitest run src/lib/play` + `npx tsc --noEmit` — PASS (el switch exhaustivo del reducer y el mapa anti-olvido obligan a que no falte nada).

- [ ] **Step 5: Commit**

```bash
git add src/lib/play/score/types.ts src/lib/play/score/events.ts src/lib/play/score/reducer.ts src/lib/play/score/reducer.test.ts src/lib/play/score/selectors.ts src/lib/play/score/selectors.test.ts src/lib/play/tools.ts src/lib/play/tools.test.ts
git commit -m "feat(play): gameName en el setup de score y evento game_labeled"
```

---

### Task 2: `gameNameSuggestions` — chips derivados del historial

**Files:**
- Create: `src/lib/play/ui/game-names.ts`
- Test: `src/lib/play/ui/game-names.test.ts`

**Interfaces:**
- Consumes: `SavedGameRecord` (`core/db.ts`).
- Produces (la usa Task 3): `gameNameSuggestions(saved: SavedGameRecord[], query: string): string[]`.

- [ ] **Step 1: Tests que fallan** (helper local `savedScore(gameName, savedAt)` que construye un `SavedGameRecord` mínimo cuyo `summary.tool.gameName` es el dado; y uno mtg para el filtro):

```ts
describe("gameNameSuggestions", () => {
  it("únicos case/acentos-insensible conservando la grafía MÁS RECIENTE, orden por recencia", () => {
    const saved = [
      savedScore("uno", 1000),
      savedScore("UNO", 3000),
      savedScore("Dominó", 2000),
    ];
    expect(gameNameSuggestions(saved, "")).toEqual(["UNO", "Dominó"]);
  });

  it("ignora partidas sin etiqueta, tombstones y otras herramientas", () => {
    const saved = [
      savedScore(null, 1000),
      { ...savedScore("Chinchón", 2000), deletedAt: 5 },
      savedMtg(3000),
    ];
    expect(gameNameSuggestions(saved, "")).toEqual([]);
  });

  it("filtra por prefijo de palabra como los chips de habituales", () => {
    const saved = [savedScore("UNO", 1000), savedScore("Dominó cubano", 2000)];
    expect(gameNameSuggestions(saved, "cub")).toEqual(["Dominó cubano"]);
  });

  it("máximo 6", () => {
    const saved = Array.from({ length: 9 }, (_, i) => savedScore(`Juego ${i}`, i));
    expect(gameNameSuggestions(saved, "").length).toBe(6);
  });
});
```

- [ ] **Step 2: Ver fallar**, **Step 3: implementar** — reutiliza la normalización de `regular-chips.ts` (expórtala desde ahí si es privada, como `normalize`, en vez de duplicarla):

```ts
import type { SavedGameRecord } from "@/lib/play/core/db";
import { matchesWordPrefix } from "./regular-chips"; // exportar helper allí si hace falta

const MAX_SUGGESTIONS = 6;

/** Juegos ya usados en la herramienta de puntuación, para los chips del setup:
 * únicos (case/acentos-insensible, gana la grafía más reciente), por recencia,
 * filtrados por la query, máx 6. PURA: se prueba sin IDB. */
export function gameNameSuggestions(saved: SavedGameRecord[], query: string): string[] {
  const byKey = new Map<string, { name: string; savedAt: number }>();
  for (const record of saved) {
    if (record.deletedAt !== null || record.summary.toolId !== "score") continue;
    const name = record.summary.tool.gameName;
    if (typeof name !== "string" || name === "") continue;
    const key = normalizeKey(name);
    const existing = byKey.get(key);
    if (!existing || record.savedAt > existing.savedAt) {
      byKey.set(key, { name, savedAt: record.savedAt });
    }
  }
  return [...byKey.values()]
    .filter((entry) => matchesWordPrefix(entry.name, query))
    .sort((a, b) => b.savedAt - a.savedAt)
    .slice(0, MAX_SUGGESTIONS)
    .map((entry) => entry.name);
}
```

(`normalizeKey`/`matchesWordPrefix`: exactamente la normalización NFD+lowercase+prefijo-de-palabra de `regular-chips.ts` — compartir, no copiar.)

- [ ] **Step 4: Verde** + `npx vitest run src/lib/play/ui` (los tests de regular-chips siguen verdes si tocaste exports).

- [ ] **Step 5: Commit**

```bash
git add src/lib/play/ui/game-names.ts src/lib/play/ui/game-names.test.ts src/lib/play/ui/regular-chips.ts
git commit -m "feat(play): sugerencias de juego derivadas del historial local"
```

---

### Task 3: Setup de puntuación — campo + chips + prefill

**Files:**
- Modify: `src/components/play/score/score-setup-form.tsx`
- Modify: `messages/es.json` (claves `play.scoreSetup.*` nuevas)

**Interfaces:**
- Consumes: `gameNameSuggestions` (Task 2), `listSaved` (`core/db.ts`), `ScoreSetup.gameName` (Task 1).
- Produces: el `game_started` de score sale con `gameName` cuando se rellenó.

- [ ] **Step 1: Draft** — `ScoreDraft` gana `gameName: string` (string simple, "" = sin etiqueta): `newScoreDraft` la inicializa a `""`; `draftFromScoreSetup` copia `setup.gameName ?? ""` (revancha/reconfigurar prefillan gratis); `toScoreSetup` añade `gameName: trimmed(draft.gameName)` al objeto devuelto.

- [ ] **Step 2: Campo + chips** — en la sección de configuración de partida (junto a dirección/target, NO en los asientos):

```tsx
        <label className="flex flex-col gap-1 text-[13px]">
          {t("scoreSetup.gameName")}
          <input
            value={draft.gameName}
            onChange={(e) => setEdited({ ...draft, gameName: e.target.value })}
            onFocus={(e) => e.currentTarget.select()}
            placeholder={t("scoreSetup.gameNamePlaceholder")}
            className={FIELD}
          />
        </label>
        {suggestions.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5" aria-label={t("scoreSetup.gameNameChips")}>
            {suggestions.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => setEdited({ ...draft, gameName: name })}
                className="tap-44 rounded-chip border border-border bg-surface px-2 py-1 text-[12px] text-foreground transition-colors hover:bg-surface-muted"
              >
                {name}
              </button>
            ))}
          </div>
        )}
```

`suggestions = gameNameSuggestions(savedRecords, draft.gameName)` con `savedRecords` cargados UNA vez al montar (`useEffect` + `listSaved(identity)` a un estado local; sin canal — los guardados no cambian mientras configuras; anon TAMBIÉN los carga, la etiqueta no exige cuenta). Ojo #856: es el mismo patrón reload-en-efecto ya deudado — no crece la deuda con más de una instancia.

- [ ] **Step 3: i18n** — en `play.scoreSetup`:

```json
"gameName": "¿A qué jugáis?",
"gameNamePlaceholder": "UNO, dominó, chinchón…",
"gameNameChips": "Juegos anteriores"
```

- [ ] **Step 4: Verificar**: `npx tsc --noEmit` + `npm run build` + `fnm use 22; npx vitest run src/lib/play` sin regresiones.

- [ ] **Step 5: Commit**

```bash
git add src/components/play/score/score-setup-form.tsx messages/es.json
git commit -m "feat(play): campo de juego con chips de anteriores en el setup de score"
```

---

### Task 4: Resumen (editar etiqueta), tablero e historial

**Files:**
- Modify: `src/components/play/score/score-summary.tsx` (mostrar/editar → dispatch `game_labeled`)
- Modify: `src/components/play/score/score-board.tsx` (subtítulo en el header)
- Modify: `src/components/play/saved-games.tsx` (fila + detalle)
- Modify: `messages/es.json` (claves `play.scoreSummary.*`, `play.saved.game`, `play.log.labeled/unlabeled`)

**Interfaces:**
- Consumes: `GameLabeledEvent` (Task 1), `store.dispatch`, `makeEvent`; `summary.tool.gameName` en el historial.

- [ ] **Step 1: Resumen** — bajo el titular (`<h1>`), la etiqueta con edición inline (patrón del renombrar de `players-manager.tsx`):
  - Sin editar: si `state.setup.gameName` → `<p>` con el nombre + botón texto `t("scoreSummary.editGame")`; si no → botón discreto `t("scoreSummary.addGame")`.
  - Editando: input (precargado, `onFocus` select) + confirmar → `store.dispatch(makeEvent<GameLabeledEvent["type"], GameLabeledEvent["payload"]>("game_labeled", { gameName: draft.trim() }, Date.now()))` → salir del modo edición. Vacío confirma también (= quitar).
  - El estado del juego llega ya re-renderizado por el store tras el dispatch (mismo flujo que todo evento).

- [ ] **Step 2: Tablero** — en el header de `score-board.tsx` (línea ~81), el `<b>` pasa a mostrar el juego si existe:

```tsx
        <b className="min-w-0 flex-1 truncate font-serif text-[15px] font-semibold">
          {state.setup.gameName ?? t("tools.score.name")}
        </b>
```

- [ ] **Step 3: Historial** (`saved-games.tsx`) — el tipo local `ScoreSummaryTool` gana `gameName: string | null`. En la FILA: donde se pinta el nombre de herramienta, para score con `gameName` se muestra el juego en su lugar (`UNO`), si no el nombre de herramienta como hoy. En el DETALLE: línea propia `t("saved.game")` + nombre cuando existe.

- [ ] **Step 4: i18n**:

```json
// play.scoreSummary
"addGame": "Añadir juego",
"editGame": "Editar juego",
"saveGame": "Guardar"
// play.saved
"game": "Juego"
// play.log
"labeled": "Partida etiquetada: {gameName}",
"unlabeled": "Etiqueta quitada"
```

- [ ] **Step 5: Verificar**: `npx tsc --noEmit` + `npm run build` + suite `src/lib/play`.

- [ ] **Step 6: Commit**

```bash
git add src/components/play/score/score-summary.tsx src/components/play/score/score-board.tsx src/components/play/saved-games.tsx messages/es.json
git commit -m "feat(play): etiqueta de juego en resumen, tablero e historial"
```

---

### Task 5: E2e + docs de cierre

**Files:**
- Create: `e2e/partidas-etiqueta-juego.spec.ts`
- Modify: `docs/requirements/backlog.md` (línea), `docs/requirements/decisiones.md` (append, heredoc Bash)

- [ ] **Step 1: E2e** (anon; patrón de partida score de `e2e/partidas-guardadas.spec.ts`):

```ts
test("la etiqueta viaja del setup al historial y los chips la recuerdan", async ({ page }) => {
  // 1. /partidas/puntuacion/nueva → escribir "UNO" en «¿A qué jugáis?» → empezar
  // 2. tablero: el header muestra UNO (no «Puntuación por rondas»)
  // 3. puntuar una ronda → finalizar → resumen muestra UNO → Guardar
  // 4. /partidas: la fila de Guardadas muestra UNO
  // 5. volver a /partidas/puntuacion/nueva → chip UNO visible → tocar → el campo se rellena
});

test("añadir la etiqueta desde el resumen de una partida sin ella", async ({ page }) => {
  // partida sin etiqueta → finalizar → «Añadir juego» → escribir "Chinchón" → confirmar
  // → el resumen la muestra → Guardar → fila con Chinchón
});
```

Correr `fnm use 22; npm run test:e2e -- partidas-etiqueta` y después `npm run test:e2e -- partidas` completo. Sin zombis al acabar.

- [ ] **Step 2: Docs** — backlog: línea `[x]` de la etiqueta en la sección BiblioPlay. decisiones.md (append):

```
## 2026-08-31 — Play: etiqueta de juego en puntuación
- La etiqueta viaja en el LOG (gameName en setup + evento game_labeled, aceptado también
  en finished): nunca edición a mano del summary guardado — el summary siempre se deriva.
- Chips de juegos anteriores derivados del historial local; sin entidad «juego» ni sync.
- Agrupación case-insensitive de stats: decisión diferida a la fase de estadísticas.
```

- [ ] **Step 3: Commit**

```bash
git add e2e/partidas-etiqueta-juego.spec.ts docs/requirements/backlog.md docs/requirements/decisiones.md
git commit -m "test(play): e2e de la etiqueta de juego + docs de cierre"
```

---

## Self-review del plan

- **Cobertura de spec:** §2 dominio → Task 1; chips §3 → Tasks 2-3; resumen/tablero/historial §3 → Task 4; §4 compat → sin tareas (nada que migrar, verificado); §5 → tests por task + Task 5; §6 → Task 5. Re-etiquetar guardadas: fuera del corte en la spec, sin issue necesaria (el detalle es lectura y la spec ya lo registra).
- **Placeholders:** los cuerpos de los e2e son guiones numerados con asserts implícitos claros; el implementador tiene el spec de guardadas como plantilla literal.
- **Tipos:** `GameLabeledEvent` (Task 1) usado en Task 4; `gameNameSuggestions(saved, query): string[]` (Task 2) usado en Task 3; `tool.gameName: string | null` consistente entre Tasks 1 y 4.
