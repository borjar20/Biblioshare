---
title: Estado vacío de la columna personal del Inicio (bloque "hoy")
date: 2026-08-11
status: design
area: home / stats / library
---

# Estado vacío de la columna personal del Inicio

## Problema

El bloque `TodayBlock` (columna IZQUIERDA del Inicio: "qué puedo disfrutar") solo
tiene dos caminos hoy (`src/components/stats/today-block.tsx:43-48`):

```ts
const later = planned.length > 0 ? <LaterShelf .../> : null;
if (!focus.featured) return later && <div className="pb-1">{later}</div>;
// ...render normal "En curso"
```

Cuando el usuario no tiene nada **en curso** ni nada **para más tarde**, el bloque
devuelve `null`: un hueco. Y cuando tiene "para más tarde" pero nada en curso, solo
aparece la estantería, sin encabezado ni una acción clara para elegir lo próximo.

La columna debe adaptarse al estado real y seguir cumpliendo su función:
ayudar a decidir qué disfrutar a continuación. No un hueco, no una card de "En curso"
vacía, no rellenar con módulos de otras columnas (actividad social, estadísticas).

## Jerarquía de datos (una sola fuente de decisión)

```
if (focus.featured)          -> Estado 1: En curso   (UI actual, sin cambios)
else if (planned.length)     -> Estado 2: Próxima lectura
else if (collection.length)  -> Estado 3: Sugerencias de colección
else                         -> Estado 4: Descubrimiento (empty)
```

Fuentes (todas ya existen, `src/lib/library/get-library-items.ts`):

| Dato               | Origen                                                        |
|--------------------|--------------------------------------------------------------|
| en curso           | `getTodayFocus(supabase, userId)` → `focus.featured`/`total` |
| para más tarde     | `getLibraryItems(supabase, userId, { status: "planned" })`   |
| colección (est. 3) | `getLibraryItems(supabase, userId, { status: "completed", limit: 3 })` |

**Estados de biblioteca**: `planned | in_progress | completed | dropped`
(`src/lib/library/types.ts`).

## Decisiones de forma

- **Estado 3 = solo `completed`.** "Empezar" desde un completado abre un pase nuevo
  (relectura): `planTransition` da `archiveAndCreate` → resultado `done`, limpio, sin
  hoja. Se descarta incluir `dropped` porque `dropped → in_progress` dispara
  `askResume` (hoja de retomar/reiniciar), que no cabe en un botón inline del Inicio.
  Un usuario con solo `dropped` cae al **Estado 4** (decisión del usuario, 2026-08-11).
- **"Empezar" refresca en sitio.** Server action `updateStatus(itemType, itemId,
  "in_progress")` (`src/lib/library/manage-actions.ts`) + `router.refresh()`. El bloque
  se re-renderiza en servidor y, al haber ya un `focus.featured`, pasa solo al Estado 1.
  No navega a `/sesion` (decisión del usuario, 2026-08-11).

## Arquitectura

**Enfoque elegido: escalera de prioridad dentro de `TodayBlock` (servidor) + un
componente por estado.** Reutiliza `updateStatus`, `LaterShelf` y el estilo de card
existente. Mantiene el patrón de render en servidor que el código ya usa a propósito
(imágenes y traducciones se resuelven en servidor; el cliente solo decide/actúa —
ver comentarios en `today-picker.tsx`). Solo cruza la frontera servidor→cliente el
dato serializable mínimo (título, portada, tipo, ids) más las etiquetas ya traducidas.

Descartado: un único componente cliente que reciba todos los datos y decida el estado
en cliente — empujaría imágenes/i18n al cliente y rompería ese patrón.

### `TodayBlock` (servidor) — orquestador

Sustituye el `if (!focus.featured)` actual por la escalera. Solo pide `completed`
cuando de verdad hace falta (sin featured y sin planned), para no gastar una consulta
en el camino feliz:

```ts
if (!focus.featured) {
  if (planned.length > 0) return <ProximaLectura planned={planned} later={later} />;
  const collection = await getLibraryItems(supabase, userId, { status: "completed", limit: 3 });
  if (collection.length > 0) return <SugerenciasColeccion items={collection} />;
  return <EmptyDiscovery />;
}
// ...Estado 1, sin cambios
```

### Componentes nuevos (`src/components/stats/`)

- **`proxima-lectura.tsx`** (servidor) — Estado 2.
  - Encabezado del bloque cambia a "¿Qué te apetece hoy?".
  - Título de sección "Tu próxima historia" (adaptable por tipo si aplica).
  - Renderiza el cliente `NextUpCard` con la lista `planned` (datos serializables).
  - Debajo, `LaterShelf` (reutilizado) con el resto de la cola.
  - Layout de dos columnas en escritorio como el actual (izquierda destacado,
    derecha estantería), una sola columna en móvil.

- **`next-up-card.tsx`** (`"use client"`) — la card destacada de Estado 2.
  - Estado local: índice dentro de `planned[]` (empieza en 0).
  - Muestra: portada, título, tipo de contenido, contexto ("Lo tienes guardado para
    más tarde"), acento de color por tipo (`MEDIA_ACCENT`).
  - CTA principal **"Empezar"** → `StartButton` (abajo).
  - CTA secundario **"Sugerirme otro"** → rota el índice (módulo `planned.length`);
    oculto si `planned.length <= 1`. Rotación entre elementos existentes, sin sistema
    de recomendaciones.

- **`collection-suggestions.tsx`** (servidor) — Estado 3.
  - Encabezado "¿Qué empezamos?".
  - 2–3 cards de `completed` con portada/título/tipo y un **"Empezar"** por card
    (`StartButton`) = relectura inline.

- **`empty-discovery.tsx`** (servidor) — Estado 4.
  - Encabezado "Encuentra algo para disfrutar", tono editorial (no error).
  - CTAs: **"Buscar"** (`/buscar`) y **"Explorar la colección"** (`/coleccion`).
  - Nada de estadísticas ni actividad social.

- **`start-button.tsx`** (`"use client"`) — compartido por Estados 2 y 3.
  - Props: `itemType`, `itemId`, `label`, opcional `className`.
  - `onClick`: `startTransition(async () => { await updateStatus(itemType, itemId,
    "in_progress"); router.refresh(); })`. Deshabilitado mientras `isPending`.
  - Defensivo: si `updateStatus` devolviera `askResume` (no debería para planned ni
    completed), igual hace `router.refresh()` — no rompe, el bloque queda como esté.

## Flujo de datos

1. `TodayBlock` (servidor) resuelve `focus` + `planned` (ya lo hace) y, solo si toca,
   `completed`.
2. Elige rama por la escalera y pinta el componente de estado.
3. Estados 2/3: el usuario pulsa "Empezar" → `StartButton` (cliente) llama al server
   action `updateStatus` → escribe el pase → `router.refresh()`.
4. Re-render del `TodayBlock`: ahora hay `focus.featured` → Estado 1.

## Responsive

- **Escritorio**: el bloque cruza las dos columnas como ahora; Estado 2 mantiene el
  grid `destacado | estantería`.
- **Tablet**: se adapta al ancho disponible (mismo grid colapsable).
- **Móvil**: una sola columna; CTA principal "Empezar" a ancho completo.

## i18n

Nuevas claves bajo `today` en `messages/es.json` (único locale del proyecto).
Propuesta:

```
"nextUpTitle": "¿Qué te apetece hoy?",
"nextUpSection": "Tu próxima historia",
"nextUpContext": "Lo tienes guardado para más tarde",
"startCta": "Empezar",
"suggestAnother": "Sugerirme otro",
"collectionTitle": "¿Qué empezamos?",
"emptyTitle": "Encuentra algo para disfrutar",
"emptySearch": "Buscar",
"emptyExplore": "Explorar la colección"
```

(Los textos finales se afinan al implementar; mantener el registro editorial actual.)

## Diseño visual

Sin rediseño general: tema oscuro, serif de titulares, mono de rótulos, bordes/radios
(`rounded-[12px]`/`[14px]`), acentos por tipo (`MEDIA_ACCENT`), sombras (`shadow-card`,
`shadow-cover`) y densidad ya existentes. El estado vacío debe sentirse editorial y
útil, no como un mensaje de error.

## Pruebas

- **e2e** (`e2e/`): un caso por estado, sembrando datos:
  1. con `in_progress` → sigue viendo "En curso".
  2. sin `in_progress`, con `planned` → "¿Qué te apetece hoy?" + "Empezar" pasa a
     "En curso"; "Sugerirme otro" rota.
  3. solo `completed` → "¿Qué empezamos?" + "Empezar" abre relectura.
  4. usuario nuevo → "Encuentra algo para disfrutar" con CTAs.
- **qa-verifier** tras implementar (navegador real), luego `test-author` para durar.

## Fuera de alcance (YAGNI)

- Sistema de recomendaciones real ("Sugerirme otro" solo rota lo que ya hay).
- Retomar/reiniciar `dropped` inline (cae a Estado 4; la ficha ya lo cubre).
- Rediseño de las cards existentes más allá de lo necesario para los nuevos estados.
