# Registrar sesión v2 — diseño

> **[Spec de diseño · propuesta, no construido]** Redactado el 2026-07-20.
> Cubre el rediseño de la hoja de registrar sesión y su paso de página completa a
> **modal interceptado**. Se apoya en el mockup `Paper - Registrar sesión v2.html`
> (frames A–D).
>
> **Este ciclo no toca esquema**: ninguna migración, ningún cambio en
> [`data-model.md`](../../requirements/data-model.md).
>
> Es el **primero de dos ciclos**. El segundo son las notas
> ([`2026-07-20-Notas`](2026-07-20-Notas)), que montará el `NoteComposer` dentro de esta hoja
> ya rediseñada. Por eso aquí la nota **sale** de la hoja: no se restila algo que se va a
> sustituir entero.

## 0. Problema

Registrar una sesión es el gesto más repetido del producto, y hoy tiene tres fricciones:

1. **Es una página, no una hoja.** Se entra a `/sesion/[passId]` desde **cinco** sitios
   distintos (`libro/[id]/page.tsx:227`, `now-consuming.tsx:41`, `session-list.tsx:75`,
   `today-card.tsx:50`, `log-panel.tsx:729`), y **al guardar siempre redirige a la ficha**
   (`lib/sessions/actions.ts:256`). Registras desde el inicio y acabas en otra pantalla, con
   tu contexto perdido.
2. **El control de páginas no escala al uso real.** Hoy son dos inputs *desde → hasta*
   (`session-form.tsx:241-275`), de los cuales el «desde» **ni siquiera se envía al
   servidor** — es ayuda visual (`session-form.tsx:72-75`).
3. **La rejilla de episodios crece sin límite.** Los chips de episodio
   (`session-form.tsx:305`) se pintan todos: una temporada de 24 episodios convierte la hoja
   en un scroll interminable, y solo distinguen marcado/no marcado.

## 1. Estado real de partida (verificado 2026-07-20)

Contra la BD de producción y el código, no contra la documentación:

- **`series_episodes` ya tiene `still_url` y `title`.** 414 de 435 filas (95 %) traen
  miniatura. La rejilla con thumbnails **no necesita esquema nuevo**; sí necesita fallback.
- **`ClosePassSheet` ya es un componente autónomo** (`components/detail/close-pass-sheet.tsx`,
  183 líneas, `<dialog>` nativo, props `passId/itemType/itemId/open/onClose`). `log-panel` solo
  lo monta. Reutilizarlo desde el modal es barato — el coste está en el servidor, no en la UI.
- **Next.js 16.2.10**, con `intercepting-routes` y `parallel-routes` disponibles.
- El layout raíz (`app/layout.tsx`) es limpio: añadir un slot es trivial.

## 2. Decisiones

| # | Decisión | Por qué |
|---|---|---|
| D1 | **Modal por ruta interceptada** (`@modal` + `(.)sesion/[passId]`), no dialog montado en cada punto de entrada. | Los cinco `<Link>` existentes **no se tocan**. El deep link y la recarga siguen dando la página entera gratis. El botón atrás cierra el modal. La carga de datos se queda en el servidor, donde ya está. |
| D2 | **Modal centrado en pc, pantalla completa en móvil.** | Es lo que pide el mockup (hoja con tirador y footer pegajoso) y lo que hace que registrar desde el inicio no te saque del inicio. |
| D3 | **`addSession` deja de hacer `redirect()`** y devuelve estado. | Es el cambio de fondo: mientras el servidor redirija, el modal no puede existir. Ver §5. |
| D4 | **El auto-cierre se encadena dentro del mismo modal**, no navegando a la ficha. | Coherencia con «nunca te saco de donde estás». Barato porque `ClosePassSheet` ya está extraído. |
| D5 | **La cifra del stepper ES el input.** `−`/`+` solo para ±1; chips `+10/+25/+50` para el salto. | Una sesión avanza 50 páginas: pulsar `+` cincuenta veces es inaceptable. Se descarta el mantener‑pulsado con aceleración (difícil de acertar en móvil, y el input editable ya resuelve el caso). |
| D6 | **Rejilla de episodios con altura tope y scroll propio** (4 filas / 8 episodios), posicionada en el primer episodio sin ver. | Una temporada de 24 debe ocupar lo mismo que una de 8. Abrir en E1 cuando vas por el E15 es inútil. |
| D7 | **La nota sale de la hoja** en este ciclo; el servidor sigue aceptando sus campos. | El ciclo de notas la sustituye por el `NoteComposer` completo (frame A del mockup de notas). Restilar ahora lo que se tira en dos semanas es trabajo perdido — pero dejar el servidor intacto evita tener que reponerlo. |
| D8 | **El selector de Estado se queda, plegado** al final de la hoja. | El caso normal (registrar y seguir) no debe verlo; abandonar o completar a mano sigue siendo posible sin ir a la ficha. |
| D9 | **Serie sigue sin duración ni cronómetro.** | §7.14, sin cambios: una sesión de serie se mide en episodios. |

## 3. Arquitectura

```
src/app/
  layout.tsx                        ← + slot {modal}, hermano de <AppShell>,
                                      dentro de NextIntlClientProvider
  @modal/
    default.tsx                     ← null
    (.)sesion/[passId]/page.tsx     ← <SessionModal><SessionSheet/></SessionModal>
  sesion/[passId]/
    page.tsx                        ← deep link y recarga: la hoja a página completa
    load-context.ts                 ← NUEVO · la carga de datos, compartida

src/components/session/
  session-modal.tsx                 ← cáscara <dialog>: fullscreen móvil / centrado pc
  session-sheet.tsx                 ← el formulario (hoy session-form.tsx)
  book-progress-field.tsx           ← rail + stepper + duración
  series-episode-grid.tsx           ← rejilla de episodios
```

**`load-context.ts` es la pieza que evita la duplicación.** Hoy `sesion/[passId]/page.tsx`
son 179 líneas de carga: pase activo, `ensureSeriesEpisodes`, `getEpisodeData`, `getEditions`
y el cálculo de `total` contra la edición del pase. Las dos entradas —modal y página— la
llaman; ninguna la copia.

**`SessionSheet` no sabe en qué contenedor vive.** Pinta cabecera, contenido y footer
pegajoso, y funciona igual dentro del `<dialog>` que dentro de un `max-w-lg` en la ruta
directa. El único parámetro que distingue los dos modos es **a dónde ir al guardar** (§5).

## 4. Anatomía de la hoja

**Común a los dos tipos:** hero con portada y tinte por tipo (`MEDIA_ACCENT`, ya existe),
cabecera pegajosa `Registrar sesión ✕`, footer pegajoso con el botón de guardar.

### Libro

- **Avance** — rail de tres tramos (ya leído / esta sesión / queda) con leyenda.
- **Página final de hoy** — stepper grande. La cifra es un `input` numérico (D5):

  ```
  ┌─ Página final de hoy ──────────────┐
  │  −  │      240      │  +  │
  │     │  pág. actual  │     │
  └────────────────────────────────────┘
     (+10) (+25) (+50)
     Desde tu marca 180 → 240
     ▲ 60 páginas leídas · quedan 422
  ```

  Sustituye los dos inputs *desde/hasta*. **No hay pérdida funcional**: el «desde» nunca se
  enviaba al servidor, así que pasa a ser texto derivado del pase.
- **Duración** — segmented `✎ A mano | ◷ Cronómetro`.
  - *A mano* despliega chips `15 / 30 / 45 / 1 h / Otro`. Los chips **rellenan** el input de
    minutos que ya existe (`session-form.tsx:217`); **«Otro» lo deja vacío y enfocado**. Un
    solo `name="durationMinutes"` en el DOM — los chips son un acelerador, no un sustituto.
  - *Cronómetro* convierte el bloque en el dial del frame B y compacta el rail de páginas a
    su versión de una línea.
- **Fecha**, y **Estado** plegado al final (D8).

### Serie

- **Tira de temporadas**, con `6/10` bajo cada número.
- **Rejilla de episodios** a 2 columnas: miniatura (`still_url`, con fallback para el 5 % sin
  ella), número y estado en **tres** valores — *visto antes* / *esta sesión* / *sin ver*. Ese
  tercer estado es nuevo; el dato ya está en `initialWatched` (`session-form.tsx:135`), que
  hoy solo se usa para contar el delta.
  - Altura tope 4 filas con scroll propio y desvanecido arriba/abajo (D6).
  - Al abrir, posicionada en el primer episodio sin ver.
- **Fecha**, **Estado** plegado. Sin duración ni cronómetro (D9).

**Footer** — `Guardar sesión` en libro; `Guardar · 2 episodios` en serie, con contador vivo.

## 5. Guardado, auto-cierre y reactividad

`addSession` deja de redirigir y devuelve estado (D3):

| Situación | Servidor devuelve | Cliente hace |
|---|---|---|
| Guardado normal, **en modal** | `{ ok: true }` | `router.back()` — te quedas donde estabas |
| Guardado normal, **en página** (deep link) | `{ ok: true }` | Navega a la ficha, como hoy: no hay a dónde volver |
| **Auto-cierre** del pase | `{ ok: true, passClosed: true }` | El modal **no** se cierra: monta `<ClosePassSheet open>` encima. Al cerrarla, cierra todo |

El auto-cierre es la rama de `actions.ts:243-253`: la sesión alcanza la última página de tu
edición o el último episodio del pase, `applyTransition(... "completed")` cierra el pase y hoy
redirige a `?cerrar=<passId>&tab=log`. Ese parámetro **deja de ser el mecanismo** cuando
vienes por modal; sigue funcionando para la ruta directa y para `log-panel`.

`revalidateReadingLog(itemType, itemId)` se sigue llamando en los tres casos, así que la
pantalla de origen se refresca sola.

### Riesgos anotados

- **`<dialog>` dentro de `<dialog>`.** `SessionModal` y `ClosePassSheet` son ambos
  `showModal()`. El anidamiento es legal (pila de *top layer*), pero **hay que verlo en
  navegador**, no darlo por bueno.
- **Reactividad.** El proyecto tiene historial de mutaciones que no se reflejan sin recargar,
  y en uno de los casos el culpable fue **el service worker sirviendo payloads RSC de caché**,
  no React ni Next. Si al cerrar el modal la pantalla de origen sale desactualizada, se
  descarta el SW **antes** de tocar nada más.

## 6. Alcance

**Dentro:** el modal interceptado, la hoja rediseñada (libro y serie), el encadenado del
cierre de pase, y la extracción de `load-context.ts`.

**Fuera, explícitamente:**

- El `NoteComposer` y las cuatro superficies de consumo de notas → ciclo siguiente.
- Rehacer `log-panel.tsx` (738 líneas, roto). Sigue montando `ClosePassSheet` como hoy.
- OCR, muro público, tarjeta compartible.

## 7. Verificación

E2E con Playwright, según [`TESTING.md`](../../TESTING.md):

1. Abrir el modal desde el inicio y, tras guardar, **seguir en el inicio** con el progreso
   actualizado.
2. Deep link a `/sesion/[passId]` renderiza la página entera, no el modal.
3. El botón atrás cierra el modal sin guardar.
4. El auto-cierre encadena `ClosePassSheet` sin navegar.
5. La rejilla de una temporada larga scrollea dentro de su caja y arranca en el primer
   episodio sin ver.

⚠️ **Al verificar, cuidado con el bug abierto #106** — «Seguir» no persiste el pase (0 filas
en `passes`), preexistente y ajeno a este trabajo. Si no aparece progreso, descartar #106
antes de culpar al rediseño. Ver `docs/TRAMPAS.md` §16.

## 8. Al cerrar el ciclo

- Marcar la casilla en [`backlog.md`](../../requirements/backlog.md).
- Añadir al final de [`decisiones.md`](../../requirements/decisiones.md) la decisión de forma:
  **registrar sesión pasa a modal interceptado** (D1/D2), que es la que tiene alcance más allá
  de esta pantalla — sienta el patrón para cualquier otra hoja con múltiples puntos de entrada.
- **No hay que tocar `data-model.md`**: este ciclo no cambia esquema.

## 9. Enlaces

- Mockup: `Biblioshare_mockups/Paper - Registrar sesión v2.html` (frames A–D).
- Ciclo siguiente: [`2026-07-20-Notas`](2026-07-20-Notas).
- Esquema: [`data-model.md`](../../requirements/data-model.md) §3 (el pase y sus satélites).
