# Itinerarios: rediseño Paper del editor de pasos — diseño

Issue: #261. Mockup: `Paper - Itinerarios (rediseño) (1).html`, frames **M5, M6, M7, D2**
(la mitad que #263 no tocó — #263 cubrió M1-M4+D1, la pantalla de gestión).

Alcance de este PR: móvil (M5-M7) **y** escritorio (D2) juntos, mismo patrón que #263.

## 1. Qué hay hoy (para no repetirlo)

`src/components/saga/editor/route-editor.tsx` (155 líneas) y
`src/app/saga/[id]/rutas/[slug]/editar/page.tsx`:

- Nota siempre visible bajo cada paso (`<Input>`), casi siempre vacía.
- Añadir es una sopa de chips (un botón por ítem/subsaga fuera del borrador), sin buscador ni
  agrupación.
- Cada paso muestra solo `label`: ni portada, ni tipo, ni rol.
- El error de validación es un `<p>` rojo suelto sobre el botón de guardar.
- Sin recuento de cambios sin guardar.
- Una sola columna: no hay variante de escritorio (la gestión ya la tiene desde #263).

## 2. Datos: la paleta necesita más campos

`RouteEditorItem` (`hydrate-route-draft.ts`) hoy es `{ key, label, entry }`. Pasa a llevar,
según sea ítem o bloque:

- **Ítem** (`entry.itemType !== null`): `coverUrl`, `itemType`, `role` — los tres ya vienen en
  `DetailMember` (`detail.groups[].members`), cero query nueva.
- **Bloque subsaga** (`entry.childSagaId !== null`): `accent: SagaAccentToken` (resuelto de
  `SagaChildRef.accentColor` con el mismo criterio que usa el mapa derivado — persistido o
  rotación `SAGA_ACCENT_SEQUENCE`) y `memberCount` (`detail.groups.find(g => g.sagaId ===
  c.id)?.members.length ?? 0` — grupo puede no existir si la subsaga está vacía, entonces 0).

`page.tsx` construye estos campos al montar la paleta (`detail.childRefs` +
`detail.groups`), igual que ya construye `key`/`label`/`entry`. `hydrate-route-draft.ts` no
cambia de contrato: sigue heredando `note` de la entrada real guardada, nunca de la paleta
(el hallazgo ya documentado en el fichero — perdería notas reales en el full-replace si se
rompiera).

## 3. Componentes

Nuevo contenido de `src/components/saga/editor/` (el fichero `route-editor.tsx` existente se
reescribe, no se renombra):

- **`route-editor.tsx`** — único dueño del estado: `draft`, snapshot inicial (para el diff),
  qué hoja está abierta. Monta las dos cáscaras a la vez y las oculta por breakpoint (regla de
  los dos árboles, mismo patrón que `routes/routes-manager.tsx`). Las hojas se montan aquí,
  fuera de las cáscaras — un `<dialog>` dentro de un contenedor `display:none` no pinta.
- **`step-row.tsx`** — una fila: número, portada (o barra de color + «BLOQUE · N obras · se
  despliega al leerlo» si `childSagaId`), título, chip de tipo, chip de rol si no es null,
  `↑↓✕`, y el «+ Nota» / nota expandida con contador `n/200`. Mismo control `↑↓` que hoy
  (botones, no drag & drop — la lista es corta, ver comentario ya existente en el fichero
  viejo); D2 añade un asa `⠿` puramente visual encima del mismo mecanismo, no drag & drop real.
- **`add-steps-sheet.tsx`** — buscador (filtro en cliente sobre la paleta ya cargada, sin
  round-trip: el subárbol es pequeño, igual criterio que hoy) + subsagas primero, obras después,
  ✓ en lo ya añadido. Se monta en una hoja en móvil (chasis `SheetShell`, extraído de
  `routes/route-sheet.tsx` a un sitio compartido — hoy es local a ese fichero) y directo en el
  raíl en escritorio: mismo componente, dos huéspedes, sin lógica duplicada.
- **`route-savebar.tsx`** — recuento de cambios por categoría + hueco de error de validación
  (sustituye el `<p>` rojo suelto). Estado sin pasos: «Sin cambios» + botón deshabilitado.
- **`shell-mobile.tsx`** / **`shell-desktop.tsx`** — mismas props (`ShellProps`-like), distinta
  disposición: una columna en móvil, raíl con buscador + vista previa «Cómo se leerá» en
  escritorio (D2).

## 4. Diff de cambios sin guardar

Nueva función pura `computeRouteDiff(initial: RouteEditorItem[], draft: RouteEditorItem[])` en
`lib/sagas/compute-route-diff.ts` (mismo patrón que `validate-route-draft.ts`: pura, testeada
aparte, TDD antes del componente):

- `added`: keys en `draft` no en `initial`.
- `removed`: keys en `initial` no en `draft`.
- `moved`: keys presentes en ambos cuyo índice relativo entre los supervivientes cambió (para
  no contar como "movido" un paso que solo se desplazó porque otro se borró delante).
- `noted`: keys presentes en ambos cuya `note` cambió (creada, editada o borrada).

Total = suma de las cuatro. Total 0 → botón deshabilitado, etiqueta «Sin cambios» (mockup M7).
El texto exacto de la barra sigue la plantilla del mockup: «N cambios sin guardar · A añadidos
· R quitados · M movidos · T notas» (se omite cada categoría en 0, como en el mockup que solo
lista tres cuando la cuarta es cero).

## 5. Validación

`validateRouteDraft` no cambia — sigue siendo la única fuente de verdad de qué es guardable.
Su error se pinta ahora dentro de `route-savebar.tsx`, no en un `<p>` aparte. Itinerario sin
pasos: estado vacío dedicado (mockup M7) — sin lista de notas ni savebar sucia, solo el hueco
de texto + «+ Añadir pasos».

## 6. i18n

Claves nuevas bajo `sagaEditor` en `messages/es.json`, junto a las `route*` ya existentes
(`routeStepNoteLabel`, `routeStepsSave`, etc. — no se listan aquí una a una, el plan de
implementación las enumera con su texto). Cubren: recuento por categoría de la savebar,
buscador de la hoja de añadir, badges de bloque/rol, estado vacío. `i18n-keeper` revisa
consistencia con `useTranslations()`/`t()` real al cerrar cada tarea.

## 7. Testing

- Unit: `compute-route-diff.test.ts` (TDD, antes de tocar el componente) — casos de
  añadido/quitado/movido/nota, y el caso "movido por borrado ajeno" que no debe contar como
  movido.
- e2e: se ajusta el spec existente de itinerarios si sus selectores cambian de forma.
- Verificación manual: `qa-verifier` corre el flujo completo (móvil y escritorio: añadir,
  quitar, reordenar, anotar, guardar, y el aviso de validación) en navegador antes de cerrar.

## Fuera de alcance (issue aparte si aparece)

- Drag & drop real (el asa `⠿` de D2 es decorativa sobre el mismo `↑↓`).
- Cualquier cambio a `save_saga_route` / `validateRouteDraft`: el guardado sigue siendo
  full-replace renumerado 1..n, sin tocar la RPC.
