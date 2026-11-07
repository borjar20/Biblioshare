# Registrar sesión y cerrar una lectura como ritual — diseño

[Histórico · congelado 2026-11-07]

**Estado:** aprobado por Borja (brainstorming 2026-11-07).
**Antecedente:** `docs/superpowers/specs/2026-11-06-sacar-lomo-partida-design.md`. Este rework
lleva su esencia (objeto físico como metáfora, voz de la mascota, controles opcionales, materiales
de madera, latón, piel, papel y lacre) a los dos flujos núcleo del pase.

## Problema

- **Registrar sesión** (`src/components/session/session-sheet.tsx`, ruta `/sesion/[passId]`
  directa o interceptada) es el flujo más usado de la app y hoy es un formulario: raíl, contador,
  chips y campos.
- **Cerrar una lectura** (`src/components/detail/close-pass-sheet.tsx`) es el momento más
  significativo del pase, pero se resuelve con la misma hoja de campos que cualquier edición.
- Ninguno de los dos comparte la identidad visual de la partida «Sacar un lomo».

## Decisiones

1. **Peso en los dos flujos por igual.** La sesión diaria no gana pasos: cambia su forma y gana un
   microrritual de 1–2 s al guardar. El cierre es el ritual largo.
2. **Juguete antes que formulario** (regla de la casa, ver memoria «BiblioPlay manda juguete sobre
   formulario»): en libros, el progreso se marca con un **marcapáginas sobre el libro de canto**;
   los campos libres (página exacta, minutos exactos, hora) quedan **tras un «+»**. En series, la
   cuadrícula de episodios se queda con los materiales nuevos.
3. **Metáfora de cierre: la última página.** La reseña es una **dedicatoria** escrita en el objeto;
   la nota es un **sello de lacre**.
4. **Un objeto por tipo con los mismos gestos:** libro → última página; película → **entrada de
   cine** (reseña en el reverso, lacre sobre el talón); serie → **caja del último disco** (reseña en
   el librito, lacre como precinto).
5. **Las celebraciones siguen separadas** en su overlay (`src/components/celebrations`), sin
   cambios: la mascota comenta la sesión dentro de la hoja y el overlay sale después, como hoy.
6. **Una sola spec y una sola PR** con la base compartida, el cierre y la sesión.
7. **Enfoque: conservar la orquestación y cambiar la presentación.** `session-sheet.tsx` y
   `close-pass-sheet.tsx` siguen siendo dueños de datos, guardado y salidas; se sustituyen sus piezas
   visuales. Las server actions (`addSession`, `closePass`, `updatePass`, `updateStatus`) y el
   esquema **no cambian**.

## Lo que no cambia (protecciones existentes)

Hay que conservarlas tal cual y sus tests deben seguir en verde:

- la salida única del modal de sesión (`session-modal.tsx`, #117) y el cierre del `<dialog>` antes
  de navegar (#448);
- `askResume`, que conserva el borrador y reenvía el mismo FormData;
- `withNetworkCatch`: sin red, la hoja sigue montada con lo tecleado;
- el cronómetro, que solo se apaga con el guardado confirmado (`clearRunningTimer`);
- el cuaderno de citas anclado al valor **en vivo** de la página (`e2e/notas-captura.spec.ts`);
- `<input name="page">`, `name="durationMinutes"` y `name="startedAt"` como únicas fuentes de esos
  valores en el FormData;
- en el cierre: «Ahora no» no llama a `closePass` (el pase queda cerrado sin nota); el visionado
  conjunto (#1220) solo al completar.

## La sesión diaria

**Escena.** La hoja (modal o página) adopta el fondo de la partida: madera y luz cálida. La mascota
va sentada en la cabecera junto a la obra (`StageMascot`). Al abrir dice una frase con datos («Ibas
por la 180. ¿Hasta dónde hoy?»).

**Libros: `BookmarkField`** (sustituye el raíl y el contador dentro de `BookProgressField`):

- Se ve el libro de canto con el bloque de páginas en papel. Lo leído queda algo más oscuro y una
  cinta de marcapáginas sale de la página actual.
- Arrastrar la cinta (o tocar el canto) fija la página destino. La página y el tramo de hoy salen
  en grande: «180 → 214 · +34 págs.».
- Es un `role="slider"` con `aria-valuemin` = página actual del pase, `aria-valuemax` = total,
  `aria-valuenow` y `aria-valuetext` («página 214, 34 hoy»). Teclado: flechas ±1, AvPág/RePág ±10,
  Inicio/Fin.
- Botones de latón «+10 · +25 · +50» (los saltos actuales).
- Tras un «+»: el número exacto (input), la hora de inicio y los minutos exactos.
- Las 4 fichas de duración (15/30/45/60) siguen visibles como chapas de latón. El cronómetro
  (`SessionTimer`) se queda.
- **Contrato:** escribe en el mismo `<input name="page">` y llama al mismo `onPageChange`. Sin
  total conocido, la cinta se mueve sobre un rango de `max(fromPage + 100, fromPage × 1,5)` y el
  número exacto sigue disponible tras el «+».

**Series.** `SeriesEpisodeGrid` conserva su comportamiento; las fichas pasan a papel con un sello
al marcarse.

**Al guardar (microrritual, 1–2 s):** con la respuesta OK, la cinta se asienta en la nueva página y
la mascota dice la frase de la sesión («34 páginas. Ya pasaste la mitad.»). Después la hoja se
cierra por su salida de siempre y el overlay de celebraciones drena como hoy. Si la sesión completa
la obra, en vez de cerrarse encadena el cierre, como hoy.

**Sin cambios:** fecha, estado plegado y «compartir».

## El cierre

**Apertura:** como hoy (encadenado desde la sesión que completa la obra, o al marcar leído o
visto). Mismo `<dialog>` con la escena de madera.

1. **Recuento.** La mascota abre con datos reales del pase: «23 sesiones en 41 días · 412 páginas
   · tu racha más larga, 9 días». En una película basta con la fecha y la franja horaria («La viste
   el viernes por la noche»). Sin datos (sin sesiones registradas), una frase genérica por tipo.
2. **Objeto de cierre según el tipo** (`LastPage`, `Ticket`, `DiscBox`, con interfaz común):
   - **Libro:** la última página abierta. La reseña es una dedicatoria sobre papel con tipografía
     de pluma (serif cursiva).
   - **Película:** la entrada de cine; la reseña en el reverso.
   - **Serie:** la caja del último disco; la reseña en el librito interior.
   - **Fecha:** en los tres, un sello de tinta (`InkDateStamp`), hoy por defecto. Tocarlo abre el
     selector y escribe en `name="finishedOn"`.
3. **Nota = lacre (`WaxSeal`).** Es una piel nueva sobre `RatingDots`: misma escala 1–10 con medios,
   misma accesibilidad y el mismo `<input type="hidden" name="rating">`. Al elegir, el lacre se
   estampa con un golpe breve y el número queda grabado.
4. **Ajustes:** chapas y casillas de latón (como en «Afinar») para el aviso de spoiler, la
   visibilidad pública o privada y, al completar, «¿Con quién la viste?».
5. **Despedida.** «Guardar» cierra el objeto (el libro se cierra, la entrada se perfora, la caja se
   precinta). Después el lomo vuela a la balda de terminados (`MiniShelf`) y la mascota se despide
   con alegría. Tras la animación, la hoja se cierra por su salida de siempre. «Ahora no» sigue
   igual.

**Abandonar (`status === "dropped"`):** sin lacre. El libro se cierra con el marcapáginas aún
dentro, en la página donde se dejó. `DroppedReasonFields` se presentan como fichas de papel en
lugar de la nota. Frase comprensiva de la mascota («No todos los libros son para ahora»).

## Base compartida

Se extrae de la partida sin cambiarle el comportamiento, a `src/components/stage/`:

- `materials.module.css`: tokens y clases de madera, latón (chapas, pomos), piel (botón
  principal), papel (fichas, páginas), tinta y lacre. `sorteo-stage.module.css` pasa a importarlos.
- `StageMascot`: la mascota sentada con su bocadillo, hoy `src/components/rincon/stage-pet.tsx`
  (caja real del sprite con `spriteBox`, bellota y narrador). La partida pasa a usarlo.
- `MiniShelf`: un tramo de balda para la animación del lomo que vuelve a la balda.

## Datos

- **Mascota en la sesión:** el loader de la ruta `/sesion/[passId]` añade la mascota con
  `getCompanionState` (cliente de la petición, **sin `use cache`**, regla #437). Misma regla que la
  partida: sale aunque `companion_hidden`; narrador solo sin mascota.
- **Mascota y recuento en el cierre:** la hoja se abre desde varios sitios, así que una server
  action `loadClosingContext(passId)` trae los dos al abrir (sesiones del pase con el cliente de la
  petición, sin caché). Recuento: nº de sesiones, días entre la primera y la última, páginas o
  episodios del pase y la racha más larga de días consecutivos con sesión.
- **Frases:** `session-lines.ts` y `closing-lines.ts`, puros con rng inyectable, como
  `sorteo-lines.ts`. El texto va en `messages/es.json`, namespace `ritual`.

## Errores

- Si `loadClosingContext` falla, el cierre funciona sin recuento y la mascota usa una frase
  genérica.
- Si la mascota no carga, habla el narrador.
- El resto, como hoy: sin red, `askResume`, error del visionado conjunto (la hoja se queda abierta
  con el error).

## Movimiento y accesibilidad

- Con `prefers-reduced-motion`, el marcapáginas, el lacre, el cierre del objeto y el vuelo del lomo
  se reducen a fundidos cortos (≤ 120 ms), igual que en la partida.
- El bocadillo de la mascota es `role="status"` estable, como en la partida.
- Foco visible en todos los controles nuevos.

## Pruebas

- **Vitest:**
  - frases y recuento (racha más larga, días, pase sin sesiones);
  - `BookmarkField`: relación cinta ↔ página, límites, teclado, que escribe en `name="page"` y llama
    a `onPageChange`, y el caso sin total;
  - `WaxSeal`: valores 1–10 y medios, mismo hidden input;
  - las variantes de cierre por tipo y el abandono;
  - los tests actuales de `session-sheet` y `close-pass-sheet` siguen en verde.
- **Playwright contra build de producción:**
  - los e2e actuales de sesión y notas, sobre todo `e2e/notas-captura.spec.ts`;
  - nuevo: registrar la sesión que termina un libro → cierre → sellar la nota y escribir la
    dedicatoria → comprobar en BD `rating` y `review` del pase;
  - nuevo: cierre de una película con la entrada;
  - un recorrido con `reducedMotion: "reduce"`.

## Fuera de alcance

- Rediseñar el overlay de celebraciones (decisión 5).
- Cambios en las server actions o en el esquema.
- Otras entradas al progreso (widget Android, tarjeta de hoy), que siguen igual.
