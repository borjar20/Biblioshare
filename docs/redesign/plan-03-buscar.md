# Fidelidad Paper · 03 — Buscar

> Parte de la iniciativa **fidelidad Paper**. Índice y convenciones en [`README.md`](./README.md).

**Maquetas de referencia**
- `Paper - Buscar y añadir.html` → frames **A · Móvil Buscar**, **B · Añadir manualmente**, **C · Escritorio Buscar**
- `Paper - Colas, Retos, Usuarios, Admin.html` → frame **3 · Buscar · Personas**

**Objetivo:** que `/buscar` (títulos y personas) y `/buscar/manual` calquen esos frames, respetando la decisión ya mergeada de la **escalera de hidratación** (la búsqueda no escribe en BD; tarjeta→ficha→edición).

---

## 1. Estado actual

| Pieza | Archivo | Estado |
|---|---|---|
| Página | `src/app/buscar/page.tsx` | Modos Títulos/Personas ✔ (conmutador mono con subrayado). h1 sin serif. Sin contador de resultados. |
| Selector tipo + barra | `src/app/buscar/search-form.tsx` | Píldoras con **icono** (no dot de color); activa rellena de accent ✔; barra + botón Buscar ✔; escáner ISBN solo libros ✔. |
| Tarjeta de resultado | `src/app/buscar/search-result-card.tsx` | Portada 2/3, badge "N ediciones" ✔, título serif ✔, autoría·año. Sin borde teñido por tipo, sin botón añadir (decisión escalera), autoría no itálica-serif. |
| Escáner | `src/app/buscar/barcode-scanner.tsx` | Existe (ML Kit vía Capacitor). Revisar estilo del disparador. |
| Personas | `src/app/buscar/people-results.tsx`, `src/components/social/user-card.tsx` | Funcional; comparar filas con `.userrow` de la maqueta. |
| Alta manual | `src/app/buscar/manual/manual-add-form.tsx` | Todos los campos del frame B ✔ (título*, autoría, año, editorial/páginas/ISBN por tipo, URL portada con hint). Layout una columna; falta selector de tipo como en la maqueta y el par Año+Páginas a dos columnas. |

## 2. Diferencias visuales con la maqueta (hacer sin preguntar)

1. **h1 "Buscar"** — Maqueta C: Fraunces 600 26px. Actual (`page.tsx:51`): sans. Añadir `font-serif`.
2. **Selector de tipo con dot de color** — Maqueta `.typ`: píldora `bg-surface` + borde, **dot 9px del color del tipo**, texto 13px semibold muted; la activa se rellena de accent con texto blanco y **dot blanco**. Actual: icono de línea en vez de dot, inactivas `bg-surface-muted` sin borde. Sustituir icono por dot (`MEDIA_ACCENT[type].bg`), añadir borde a las inactivas, dot blanco en la activa.
3. **Borde de portada teñido por el tipo activo** — Maqueta `.rc .cvw`: `border 1.5px color-mix(acc 40%, border)`. Actual: `border-border`. Usar `MEDIA_ACCENT[result.itemType].borderSoft` como en `library-item-card.tsx`.
4. **Eyebrow "Resultados · N"** — mono 11px uppercase sobre el grid. Actual: no existe. Añadir con `results.length` (y en Personas, frame 3, también: "Resultados · 4").
5. **Autoría en itálica serif** — Maqueta `.mm.it`. Actual: `text-xs text-muted-foreground` normal. Cambiar a `font-serif italic`.
6. **Chip del escáner** — Maqueta `.scan`: chip outline (`bg-surface`, borde, radio 10px, 12.5px muted) con icono de cámara de línea, alineado a la izquierda bajo la barra. Ajustar `barcode-scanner.tsx` a ese estilo si difiere.
7. **Enlace manual** — Maqueta: "¿No lo encuentras? Añadir manualmente" subrayado muted tras el grid ✔ (ya así). Mantener; solo revisar copy vs i18n.
8. **Formulario manual** — Frame B: selector de tipo (mismas píldoras con dot) arriba del formulario; Año y Páginas en **dos columnas** (`grid-cols-2 gap-3`); labels mono uppercase con asterisco de requerido en accent (revisar `Field`); botón final full-width "Añadir a mi biblioteca". Actual: sin selector visible (llega por `?type=`), todo a una columna, botón no full-width. Ajustar (el selector puede ser Links que cambian `?type=`, como en Buscar).
9. **Personas: filas** — Frame 3 `.userrow`: avatar con gradiente, nombre semibold, @usuario mono muted, chips pequeños de recuento por tipo ("210 libros · 132 pelis"), chevron › a la derecha. Comparar `user-card.tsx` y ajustar (sobre todo chips de recuento por tipo si ya existen los datos; si el recuento por tipo no está en la query de personas, ver §3-P3).

## 3. Divergencias funcionales — COMENTAR ANTES DE IMPLEMENTAR

> No implementar nada de esta sección sin decisión explícita del usuario.

- **P1 · Botón "+ Añadir" rápido en resultados.** La maqueta añade a biblioteca desde la tarjeta de resultado. La decisión de la **escalera de hidratación** (mergeada, PRs #34/#35) hizo la búsqueda deliberadamente de solo lectura: tarjeta → ficha → (elegir edición) → alta. Un añadido rápido tendría que hidratar obra+ediciones al pulsarlo (y en libros elegir edición, que la maqueta de Ficha exige en el primer pase). ¿Se descarta el quick-add (recomendado: contradice la escalera y el flujo de ediciones), o se quiere una versión "añadir a Pendiente con edición sin decidir"?
- **P2 · "Nova · 662 págs" en la tarjeta de resultado.** La maqueta muestra editorial·páginas, pero el código las quitó a propósito (son de una tirada concreta, no de la obra — comentario en `search-result-card.tsx`, spec 2026-07-14). Recomiendo mantener la app como está (título, autoría, año, nº de ediciones) y dar la maqueta por desactualizada aquí. ¿Confirmas?
- **P3 · Recuento por tipo en resultados de Personas.** El frame 3 muestra chips "210 libros · 132 pelis" por usuario. Si la query actual de personas no trae esos agregados, añadirlos tiene coste (agregado por usuario sobre `library_entries`, con RLS de perfiles privados). ¿Se añade el dato o se dejan las filas sin chips?

## 4. Tareas

### Tarea 1 — Cabecera, selector de tipo y eyebrow de resultados
- **Modificar:** `src/app/buscar/page.tsx`, `src/app/buscar/search-form.tsx`
- h1 serif; píldoras con dot de color (quitar iconos); eyebrow "Resultados · N" (clave i18n nueva con plural → pasar por i18n-keeper).
- **Prueba:** e2e de búsqueda existentes; añadir assert del eyebrow con resultados.
- Commit: `style(buscar): selector con dots por tipo, h1 serif y contador de resultados`

### Tarea 2 — Tarjeta de resultado fiel
- **Modificar:** `src/app/buscar/search-result-card.tsx`
- Borde de portada `MEDIA_ACCENT[itemType].borderSoft`; autoría en `font-serif italic`; badge de ediciones ya está bien (mono, blur, borde — comparar con `.rc .ed`: añadir borde si falta).
- Commit: `style(buscar): tarjeta de resultado con acento por tipo y autoría serif`

### Tarea 3 — Chip del escáner ISBN
- **Modificar:** `src/app/buscar/barcode-scanner.tsx`
- Disparador como chip outline con icono de cámara (lucide/línea 1.8), bajo la barra, `self-start`.
- Commit: `style(buscar): disparador del escáner como chip del mockup`

### Tarea 4 — Formulario de alta manual
- **Modificar:** `src/app/buscar/manual/page.tsx`, `src/app/buscar/manual/manual-add-form.tsx`
- Selector de tipo arriba (Links con dot, cambia `?type=`); Año+Páginas a dos columnas; botón submit full-width; revisar que `Field` pinte labels mono uppercase y el `*` requerido en accent.
- **Prueba:** e2e de alta manual si existe; si no, prueba manual del flujo colaborador.
- Commit: `style(buscar): formulario manual fiel al frame B`

### Tarea 5 — Filas de Personas
- **Modificar:** `src/components/social/user-card.tsx` (+ query de personas si P3 se aprueba)
- Nombre semibold + @usuario mono + chevron; chips de recuento solo si P3 aprobada.
- Commit: `style(buscar): filas de personas fieles al frame 3`

## 5. Verificación de cierre

- [ ] Frames A/B/C y `/buscar`, `/buscar/manual` lado a lado (400px y 940px); modo Personas contra frame 3.
- [ ] El tipo activo tiñe: píldora, bordes de portadas.
- [ ] Modo oscuro (Buscar·Personas está en Paper - Modo oscuro (resto).html).
- [ ] `npx playwright test` verde (Node 22).
- [ ] P1–P3 respondidas y registradas.
