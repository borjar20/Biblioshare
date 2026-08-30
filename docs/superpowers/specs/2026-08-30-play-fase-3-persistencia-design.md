# Play — Spec fase 3: persistencia local-first con IndexedDB

> [Histórico · congelado] Spec de diseño validada en brainstorming el 2026-08-30
> sobre la issue #931 (EPIC BiblioPlay), fase 3 del roadmap. Cierra las issues de
> deuda #933 (localStorage puente), #932 (sync pestañas), #935 (listeners sin
> retirar) y #936 (replay doble). Antecedente: spec fases 0–2
> (`2026-08-29-play-fases-0-2-design.md`), §4 y §10.

## 1. Objetivo y gate

Sustituir el puente localStorage del store de Play por IndexedDB, con
recuperación tras cierre, guardado explícito de partidas terminadas y espejo
entre pestañas.

**Gate de la fase (epic #931):** jugar una partida completa en modo avión,
cerrar y reabrir la app, y no perder nada.

### Decisiones cerradas en el brainstorming

| Tema | Decisión |
|---|---|
| Alcance | **Activa + terminadas**: dos almacenes; «Guardar» aparece en el resumen. Sin UI de lista de historial (fase 7) |
| Sync entre pestañas | **Espejo en vivo** por BroadcastChannel + guarda anti-pisado por `rev` |
| Modelo de datos | **Documento por partida**: el log entero como un registro, como el snapshot de hoy. Evento-por-fila se descarta hasta que fase 5 lo pida |
| Migración | El snapshot localStorage existente **se importa** al hidratar y se borra la clave vieja (era el aviso pendiente de fase 1) |
| Deuda de paso | #935 (destroy real con AbortController) y #936 (parseSnapshot de una pasada) se arreglan en este refactor |

## 2. Base de datos (`src/lib/play/core/db.ts`, nuevo)

Wrapper mínimo de promesas sobre IndexedDB, **sin dependencias**. Es el único
fichero que habla el idioma de IndexedDB; el store consume su API de promesas.

- BD `biblioshare-play`, versión 1.
- Almacén **`active`** — keyPath `identity`. La restricción «una partida activa
  por identidad» la garantiza **la clave, no un check**: escribir es upsert
  sobre el mismo registro. Registro:

  ```ts
  type ActiveGameRecord = {
    identity: string;      // uid real o "anon" (mismo aislamiento que hoy)
    v: 1;                  // SNAPSHOT_VERSION, se reutiliza el existente
    committed: PlayEvent[];
    pending: PlayEvent | null;
    rev: number;           // contador de escritura, monótono por registro
  };
  ```

- Almacén **`saved`** — keyPath `gameId` (= `committed[0].id`), índice por
  `identity`. Partidas terminadas que el usuario guardó. En fase 3 **solo se
  escriben**; leerlas y listarlas es fase 7. Registro: como `ActiveGameRecord`
  sin `rev` y con `gameId` y `savedAt` (epoch ms).
- API: `readActive(identity)`, `writeActive(record)`, `deleteActive(identity)`,
  `saveFinished(record)`. Todas devuelven promesa y **nunca lanzan hacia el
  store**: el fallo (modo privado, cuota, BD bloqueada) se devuelve como
  resultado y el store degrada a memoria, igual que hoy (spec fases 0–2, §4).
- `writeActive` es **compare-and-set sobre `rev`** dentro de una transacción:
  si el `rev` en BD ≥ el que el store cree tener + 1, no escribe y devuelve el
  registro más nuevo — es la guarda anti-pisado del §4.

## 3. Store asíncrono (cambio de contrato)

IndexedDB no se puede leer síncrono al crear el store, así que la hidratación
deja de ser inmediata. **`getSnapshot()` cambia de forma:**

```ts
type PlayStoreSnapshot =
  | { status: "loading" }                    // hidratando desde IndexedDB
  | { status: "ready"; game: ActiveGame | null };
```

- El store nace en `loading`, lanza la lectura al crearse y emite al resolver.
- **La UI trata `loading` distinto de «no hay partida».** Sin eso,
  `/partida/activa` redirigiría al hub un frame antes de hidratar y el banner
  de partida en curso parpadearía. Llamadoras conocidas a revisar:
  `use-active-game.ts`, `game-screen.tsx`, `active-game-banner.tsx`,
  `setup-form.tsx` (intercepta «ya hay una activa» antes de `start()`).
- `start/tap/dispatch/undo` sobre un store en `loading` devuelven
  `false`/`null` (la UI no ofrece acciones hasta `ready`; la guarda es cinturón).
- **Escrituras: cola en orden, fire-and-forget.** Cada commit encola su
  `writeActive`; la cola garantiza orden (una escritura en vuelo a la vez) y un
  error degrada a memoria sin romper la partida. `pagehide` ya sella la ráfaga
  pendiente (`sealNow`), que encola su escritura; IndexedDB no garantiza el
  flush si el SO mata el proceso en ese instante — pérdida acotada al último
  gesto, se asume (mismo límite que tenía el timer de sesiones).
- **#936**: `parseSnapshot` pasa a devolver `{ log, state } | null` en una sola
  pasada de replay. Desaparece el replay doble de `readStorage`.
- **#935**: los listeners `visibilitychange`/`pagehide` y el BroadcastChannel
  se registran con un `AbortController`; el store gana `destroy()` que aborta,
  cierra el canal y vacía la cola. `__resetPlayStoresForTests` llama a
  `destroy()` de cada store antes de limpiar el Map.

## 4. Espejo entre pestañas (#932)

- `BroadcastChannel` con nombre `biblioshare:play:<identity>` (mismo
  aislamiento por identidad que la clave de storage).
- Tras cada escritura confirmada, la pestaña publica `{ rev }`. Las receptoras
  comparan con su `rev` local: si es mayor, releen de BD, reemplazan su `game`
  cacheado y emiten. Las dos pestañas ven la misma partida en vivo.
- La guarda anti-pisado del `writeActive` (CAS sobre `rev`, §2) cubre la
  carrera que el canal no puede: dos commits simultáneos. La que pierde el CAS
  recarga el registro ganador y emite; su evento local se pierde y la UI queda
  consistente (mismo trato que un evento rechazado por el reducer).
- Sin BroadcastChannel (navegador raro): la guarda CAS sigue funcionando; el
  espejo en vivo simplemente no existe. No se hace polyfill.

## 5. Migración desde localStorage

Al hidratar, si `active` está vacío para la identidad **y** existe snapshot
válido bajo `biblioshare:play:<identity>:active`:

1. importarlo (`writeActive` con `rev: 1`),
2. borrar la clave de localStorage,
3. continuar como partida activa normal.

Snapshot inválido o de versión desconocida: se borra la clave y se arranca
vacío (mismo criterio destructivo-con-aviso que fase 1 documentó). La migración
corre una sola vez por identidad porque la clave se borra al completarla.

## 6. Guardar y descartar (resumen de partida)

- En el resumen (`game-summary.tsx`), junto a «Descartar»: **«Guardar
  partida»** — mueve el registro `active` → `saved` y limpia `active`. Vuelve
  al hub, como descartar.
- «Descartar» sigue igual: `deleteActive`, sin rastro.
- Sin decidir, la partida terminada queda en `active` y se recupera al reabrir
  (contrato de hoy, spec fases 0–2 §4).
- No hay pantalla que liste `saved` (fase 7) ni sync a servidor (fase 5): en
  fase 3 guardar es un acto de fe visible solo en el propio botón. El copy del
  botón lo dice claro («se guarda en este dispositivo»).

## 7. Rutas y UI tocadas

Sin rutas nuevas. Cambios:

- `use-active-game.ts`: expone `{ snapshot, store }` con la nueva forma.
- `game-screen.tsx` / `partida/activa/page.tsx`: estado `loading` → no
  redirigir; render vacío o esqueleto breve.
- `active-game-banner.tsx`: `loading` → no pintar banner (no parpadeo).
- `setup-form.tsx`: con `loading` deshabilita «Empezar» (evita `start()` que
  pisaría una activa aún no hidratada).
- `game-summary.tsx`: botón «Guardar partida».

## 8. Tests

- **Unitarios (vitest + `fake-indexeddb`)**: db.ts (CAS de `rev`, upsert,
  fallo degradado), store (hidratación async, cola en orden, `loading` →
  `ready`, migración desde localStorage, destroy sin fugas, espejo simulado
  con dos stores sobre la misma BD).
- **e2e (Playwright)**: partida → `page.reload()` → sigue viva con el mismo
  estado; terminar → «Guardar» → hub sin banner; terminar → reabrir → resumen
  recuperado. El espejo entre pestañas con dos `page` del mismo contexto.
- El resto del motor (log, replay, reducer) no cambia: sus 194 tests siguen
  siendo la red.

## 9. Plan de entregas

| PR | Contenido | Verificación |
|---|---|---|
| PR-A | `db.ts` + store asíncrono + migración + deuda #935/#936, UI adaptada a `loading` | unitarios + e2e reload |
| PR-B | Espejo BroadcastChannel + CAS + «Guardar partida» | unitarios espejo + e2e dos pestañas |

Cierre documental: `data-model.md` no cambia (todo es local, sin esquema
Supabase); `decisiones.md` gana entrada con el contrato del snapshot async;
issues #932/#933/#935/#936 se cierran citando esta spec; backlog marca fase 3.

## 10. Fuera de alcance

Lista/detalle de partidas guardadas (fase 7), sync a Supabase (fase 5),
adopción de partida anon al loguear (#934), `navigator.storage.persist()`
(se valorará si el SO desaloja datos en la práctica), redo, evento-por-fila.
