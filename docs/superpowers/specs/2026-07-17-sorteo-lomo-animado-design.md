# Sorteo "Sacar un lomo" (animado) — diseño

**Fecha:** 2026-07-17 · **Estado:** aprobado por Borja
**Mockup de referencia:** `Biblioshare_mockups/Sorteo - Sacar un lomo (animado).html`
**Antecedente:** plan 05 F4 (`spine-draw.tsx`, tarjeta mínima sin animación, en el rail del Rincón).

## Qué es

Evolución de la tarjeta "¿No sabes qué leer?" del Rincón hacia el ritual completo del mockup:
una estantería animada de lomos que elige al azar un pendiente, con filtros y CTA que
crea el pase. La ceremonia es el producto: la query aleatoria es trivial (backlog §7.28),
lo que diferencia es la animación.

## Decisiones (2026-07-17, con Borja)

1. **Alcance: mockup completo.** Filtros de tipo + duración estimada + estado del pase,
   ruleta animada, resultado con tiempo a tu ritmo y CTA contextual.
2. **Presentación: modal desde la tarjeta.** La tarjeta del rail se queda como entrada;
   "Sorpréndeme" abre un `<dialog>` nativo (patrón `new-pass-sheet.tsx`): full-screen en
   móvil, modal ~540px en escritorio. Siempre en oscuro espresso (colores fijos, sin tema).
3. **CTA crea el pase al momento** vía `updateStatus(..., "in_progress")` (el mismo gesto
   que marcar "Leyendo" en la ficha), confirma «✓ En curso» y enlaza a la ficha.

## Datos y pool

- Pool = entradas `planned` del usuario. `MediaStatus` no tiene `paused`; el pool es solo
  `planned` (el mockup mencionaba paused como genérico, aquí no existe).
- Nuevo `src/lib/rincon/get-sorteo-pool.ts` (servidor): por ítem — tipo, id, título,
  portada, minutos estimados (`computeQueueEstimates` + `getReadingPace` +
  `getMovieCadence`, los helpers de «Para más tarde»), texto de fórmula, y flag
  `fresh` = sin ningún pase anterior (consulta ligera a `passes` por los ids del pool).
- Se resuelve en `rincon-tab.tsx` (servidor) y baja ya calculado a la tarjeta cliente.

## Estantería

- Hasta ~12 lomos: muestra aleatoria del pool filtrado, rebarajada al abrir la hoja.
- Color por tipo (ámbar libro / teal película / ciruela serie — tokens `--type-*` del
  mockup), alturas variadas deterministas (derivadas del id, no aleatorias por render).
- Tocar un lomo lo saca directamente (sin pasar por la ruleta completa: la ruleta corre
  igual pero con ese ganador forzado).

## Filtros (estado en cliente; el pool completo ya está cargado)

- **Tipo:** Todos / Libros / Películas / Series (chips con punto de color).
- **⚙ Filtros** (panel plegable):
  - **Duración estimada:** Cualquiera / ‹2 h / 2–5 h / +5 h sobre los minutos estimados.
    Ítems sin estimación (sin páginas, sin ritmo, sin runtime) solo entran en "Cualquiera".
  - **Estado del pase:** Todos los pendientes / Sin empezar (= `fresh`).
  - El chip ⚙ marca con un punto cuando hay filtro activo distinto del default.
- Cambiar cualquier filtro re-renderiza la estantería y resetea el resultado.
- Sin coincidencias → mensaje "amplía los filtros" + botón desactivado.
- Pool total vacío → la tarjeta de entrada ya cubre ese caso (invita a añadir); la hoja
  no llega a abrirse con pool vacío.

## Animación del sorteo

- El ganador se decide ANTES de animar: azar uniforme sobre el conjunto filtrado.
- Ruleta: un "tick" recorre los lomos (translateY -12px), delay inicial 40ms × 1.16 por
  paso hasta tope 240ms; total = vueltas + posición del ganador. Al parar: lomo elegido
  elevado con anillo dorado (`--gold`), el resto `opacity .35`.
- Revelado (~520ms después): portada real con flip-in (`rotateY(85deg)` → 0, ~650ms),
  título serif, meta, «≈ X h a tu ritmo» (mismo texto de fórmula del pool).
- Respeta `prefers-reduced-motion`: sin ruleta ni flip, resultado directo.

## Resultado y acciones

- CTA contextual: libro «Empezar a leer» / película «Ver esta noche» / serie «Empezar
  la T1» → `updateStatus` a `in_progress`, estado del botón «✓ En curso», enlace a la
  ficha (`itemHref`). Errores: mensaje inline, sin cerrar la hoja.
- **↻ Otra vez**: repite el sorteo con los mismos filtros.
- **✕**: vuelve a la estantería inicial conservando filtros (y cierra la hoja si ya
  estaba en la estantería).

## Arquitectura

| Pieza | Fichero | Cambio |
|---|---|---|
| Tarjeta de entrada | `src/components/rincon/spine-draw.tsx` | Pierde el sorteo inline; su botón abre la hoja. Conserva estado vacío. |
| Hoja del sorteo | `src/components/rincon/sorteo-sheet.tsx` (nuevo, cliente) | Dialog + estantería + filtros + ruleta + resultado + CTA. |
| Lógica pura | `src/components/rincon/sorteo-logic.ts` (nuevo) | Elegibilidad por filtros, bucketing de duración, muestra de ~12, alturas deterministas. Testeable sin DOM. |
| Pool | `src/lib/rincon/get-sorteo-pool.ts` (nuevo, servidor) | planned + estimaciones + `fresh`. |
| Tab | `src/app/u/[username]/_tabs/rincon-tab.tsx` | Llama a `get-sorteo-pool` en vez del mapeo actual. |
| Copy | `messages/*.json` bajo `rincon.*` | Títulos, chips, panel, estados, CTA por tipo. |

## Testing

- **Vitest** sobre `sorteo-logic.ts`: bucketing ‹2h/2–5h/+5h y límites, elegibilidad
  con combinaciones de filtros, exclusión de ítems sin estimación fuera de "Cualquiera".
- **Playwright**: abrir la hoja desde el Rincón → sortear → resultado visible → CTA
  deja el ítem en curso (verificable en la UI).

## Fuera de alcance

- Filtros personalizados extra (género, saga, año, colección concreta).
- Estado `paused` en el pool (no existe en `MediaStatus`).
- Versión para visitantes (el Rincón es solo del dueño).
