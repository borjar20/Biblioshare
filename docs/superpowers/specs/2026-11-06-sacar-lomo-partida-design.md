# «Sacar un lomo» como partida — diseño

[Histórico · congelado 2026-11-06]

**Estado:** aprobado por Borja (brainstorming 2026-11-06).
**Prototipo:** https://claude.ai/artifact/1oHfMuSSZxCqEooeeQ3jj6 (HTML jugable con datos de ejemplo y la
mascota real; privado).
**Antecedentes:** `2026-07-17-sorteo-lomo-animado-design.md` (la hoja actual) y
`2026-11-01-accesos-sorteo-entre-nosotros-design.md` (los accesos por enlace directo).

## Problema

- **La experiencia es plana.** Una fila de lomos, un tick que frena y una portada que gira. Funciona,
  pero no sorprende ni invita a repetir.
- **Los controles confunden y se quedan cortos.** Hay chips de tipo y un panel «⚙ Filtros» escondido
  con duración, «estado del pase» y colección. Los nombres son técnicos y los tramos de duración
  significan cosas distintas para un libro, una película o una serie.
- **En escritorio apenas se ve el acceso.** Con algo en curso, el único acceso es un enlace en
  mayúsculas pequeñas en la cabecera de «Para más tarde».
- **Te saca del sitio.** El acceso navega a `/coleccion/rincon?sorteo=1`, así que al terminar estás
  en el Rincón, no donde empezaste.

## Decisiones

1. **Tono: juego de azar más revelación con personalidad.** La mecánica da tensión y la voz da
   gracia.
2. **Bucle: tres candidatos, descarte y duelo.** La tirada saca 3 lomos, la voz los presenta uno a
   uno, el usuario devuelve uno a la balda y los otros dos se baten en duelo.
3. **El duelo lo resuelve quien juega:** con «Que decida la suerte» o con «Me quedo con este».
4. **La voz es la mascota.** Usa sus animaciones existentes (`idle`, `sad`, `joy`) y no hace falta
   arte nuevo. Si no hay mascota incubada, habla un narrador de texto.
5. **Controles: primero el tipo y luego antojos adaptados a él.** Debajo queda un ajuste de tiempo
   plegado y escrito en lenguaje humano.
6. **Acceso en escritorio: un lomo-botón dentro de «Para más tarde».** Sustituye al enlace de la
   cabecera.
7. **La partida se abre encima de la página de origen**, con el pool cargado por server action
   mientras sube el telón. Esto **revierte** la decisión del 2026-11-01 de abrir el sorteo por enlace
   directo. Hay que registrarlo en `decisiones.md` al implementar.

## La partida

```
telón → antojo → tirada → presentación → descarte → duelo → revelación → salida
```

1. **Telón** (~700 ms, tapa la carga del pool). Un telón que se abre, la balda se ilumina y entra la
   mascota con «¿Qué te apetece hoy?».
2. **Antojo.** Fila de tipo (Todo / Libros / Películas / Series), tarjetas de antojo con su
   recuento, «Ajustar tiempo» plegado y la línea «Sorteando entre N de tus M pendientes ·
   Restablecer». Botón «¡Tirar!».
3. **Tirada.** La balda tiembla y el foco barre los lomos frenando (~1,5 s). Los tres elegidos se
   apagan en la balda.
4. **Presentación.** Los tres caen a sus pedestales boca abajo. El foco se para en cada uno, que gira
   a su portada, y la mascota dice su frase (~2,3 s por candidato). «Saltar presentación» descubre
   los tres a la vez.
5. **Descarte.** Aparece una ✕ en cada candidato. El elegido vuelve con un traspiés y la mascota
   reacciona en `sad`.
6. **Duelo.** Los dos quedan cara a cara con un «vs». Con «Que decida la suerte», el foco oscila
   frenando y para en un ganador elegido de antemano. Con «Me quedo con este», que se activa al
   tocar uno, gana el elegido.
7. **Revelación.** El ganador va al centro y se agranda, con confeti y la mascota en `joy`. Debajo:
   título, meta, «≈ X a tu ritmo», CTA por tipo («Empezar a leer», «Ver esta noche», «Empezar la
   T1»), «↻ Otra partida» y «Ver ficha».
8. **Salida.** El CTA llama a `updateStatus(…, "in_progress")`, enseña «✓ En curso» y una frase de la
   mascota, cierra la hoja y llama a `router.refresh()`. El usuario sigue en la misma página, que ya
   refleja el nuevo «en curso».

**Casos borde:**

- Con 2 elegibles se va directo al duelo; con 1, a una revelación directa («Solo me quedas tú…»).
  Con 0, «¡Tirar!» queda desactivado y la mascota pide aflojar el filtro.
- «Saltar al duelo» durante la tirada.
- ✕ o Escape cierran desde cualquier fase. «Otra partida» vuelve al antojo conservando la selección.
- `prefers-reduced-motion`: las mismas fases sin temblor, barrido, caída ni confeti. Quedan los
  fundidos cortos y se mantienen las frases.
- El ganador y los candidatos se fijan en el estado al sacarlos. Tras el CTA, el pool cambia con la
  revalidación y no se puede señalar otro título (es el bug del 2026-07-17, que sigue vigente).

## Controles

**El tipo va delante:** Todo / 📖 Libros / 🎬 Películas / 📺 Series. Los antojos dependen del tipo
elegido:

| Tipo | Antojos |
|---|---|
| Todo | 🎲 Sorpréndeme · ⏳ Lo que más espera · ✨ Nunca empezado · uno por colección sorteable |
| Libros | 🎲 Sorpréndeme · ☕ Lectura corta (≤ 4 h a tu ritmo) · ⏳ Lo que más espera · ✨ Nunca empezado |
| Películas | 🎲 Sorpréndeme · 🌙 Para esta noche (≤ 2 h 30) · ⏳ Lo que más espera · ✨ Nunca vista |
| Series | 🎲 Sorpréndeme · 🍿 Miniserie (≤ 10 episodios u ≤ 8 h) · ⏳ Lo que más espera · ✨ Nunca empezada |

- Con «Todo» no hay antojos de duración, porque su significado cambia según el tipo.
- **Lo que más espera** es el tercio del conjunto filtrado con `plannedSince` más antiguo, con un
  mínimo de 3 lomos.
- Los antojos sin candidatos se quedan visibles, atenuados y con «Nada aquí ahora», para que la
  rejilla no se mueva.
- **Ajustar tiempo** (plegado): tramos multiselección «Un rato · ‹2 h», «Una tarde · 2–5 h»,
  «Para largo · +5 h» y «Sin estimar». Siempre queda al menos uno marcado. Se combina con el
  antojo.
- Desaparece el «Estado del pase» como control suelto (lo cubre «Nunca empezado») y el filtro de
  colección pasa a ser antojo.
- El último tipo y antojo se recuerdan en `localStorage` por dispositivo, dentro de try/catch.

## La voz

**`sorteo-lines.ts`** es puro, con rng inyectable. Por cada candidato calcula los hechos y usa el
primero que aplique, en este orden:

| Hecho | Condición | Ejemplo |
|---|---|---|
| Espera larga | `plannedSince` hace ≥ 12 meses | «Te espera desde marzo de 2025. Paciencia de santo.» |
| Cabe esta noche | libro o película, ≤ 150 min | «≈1 h 40 a tu ritmo: te cabe esta noche.» |
| Miniserie | serie con ≤ 10 episodios | «5 episodios y fuera. Compromiso bajo.» |
| Va para largo | > 600 min | «≈14 h. Esto es una relación seria.» |
| Ya lo intentaste | `!fresh` | «Ya os conocéis… ¿segunda oportunidad?» |
| Nunca empezado | `fresh` | «Primera vez. Nada de spoilers.» |
| Sin datos | ninguno de los anteriores | Frase genérica por tipo |

- Cada hecho tiene 2–3 variantes.
- Hay frases de reacción para la bienvenida, el recuento en el antojo, el descarte, el duelo, la
  elección propia, la revelación y la salida.
- Todo el texto va en `messages/es.json` bajo `rincon.sorteo.lines.*`, con la fecha y la duración
  interpoladas.

**Mascota.**

- Se usa `PetSprite` con el `stage`/`petClass` del usuario, a escala de escenario, con un bocadillo
  propio.
- Animaciones: `idle` al presentar, `sad` al descartar o con pool vacío, `joy` al revelar y al
  salir.
- Bellota o sin mascota: narrador de texto en el mismo hueco, sin sprite.
- La `PetCompanion` flotante se oculta mientras la hoja está abierta.

## Acceso

- **Escritorio y tablet:** el lomo-botón es la última casilla de «Para más tarde», del tamaño de una
  portada. Lleva un montón de 3 lomos ladeados y un «?», con «¿Cuál toca?» debajo. Con hover o foco,
  los lomos se abren en abanico. Solo aparece con pendientes. Sustituye al enlace `drawLink` de la
  cabecera.
- **Móvil:** `HomeDrawTile` se queda donde está, pero abre la partida en el sitio en vez de
  navegar.
- **Rincón:** `SpineDraw` abre la misma partida con el pool que ya tiene y mantiene `?sorteo=1`.
- **Biblioteca:** sigue enlazando a `DRAW_HREF`. Abrirla en el sitio queda fuera de alcance.

## Arquitectura

| Pieza | Fichero | Qué hace |
|---|---|---|
| Server action | `src/lib/rincon/load-sorteo.ts` (`"use server"`, nuevo) | `{ pool, collections, pet }` con el cliente de la petición. **Sin `use cache`**: es dato por usuario y RLS (regla #437). |
| Pool | `src/lib/rincon/get-sorteo-pool.ts` | Añade `plannedSince` (`passes.created_at`) y `totalEpisodes` a `SorteoItem`. |
| Lógica pura | `src/components/rincon/sorteo-logic.ts` | Antojos por tipo, tramos, elegibilidad, «lo que más espera», muestra de 3. |
| Frases | `src/components/rincon/sorteo-lines.ts` (nuevo) | Hechos → clave de frase y variables. |
| Máquina de fases | `src/components/rincon/use-sorteo-game.ts` (nuevo) | Reducer de fases y temporizadores cancelables, testeable sin DOM. |
| Escenario | `src/components/rincon/sorteo-stage.tsx` (sustituye a `sorteo-sheet.tsx`) | `<dialog>` nativo con telón, escena, mascota y panel. Subcomponentes `stage-antojos`, `stage-podium` y `stage-reveal`. |
| Disparador | `src/components/rincon/sorteo-trigger.tsx` (nuevo) | Botón que abre el escenario, llama a la action y gestiona la carga y el error. |
| Lomo-botón | `src/components/stats/later-shelf.tsx` | Casilla final con `SorteoTrigger`. Quita `drawLink`. |
| Móvil | `src/components/home/home-draw-tile.tsx` | Pasa a ser un `SorteoTrigger`. |
| Rincón | `src/components/rincon/spine-draw.tsx` | Usa `SorteoStage` y conserva `DrawFromUrl`. |
| Mascota flotante | `src/components/pet/pet-companion.tsx` | Se oculta con el escenario abierto (atributo en `<html>`). |

La hoja sigue siendo espresso fija, con los mismos colores en claro y en oscuro, como la actual. Al
navegar a «Ver ficha» se cierra el `<dialog>` antes de navegar (#448).

**Errores:**

- Si falla la action, se ve la mascota en `sad` con «No he podido mirar tu balda» y «Reintentar».
- Si falla el CTA, aparece un mensaje en línea y la hoja no se cierra.
- Si el pool llega vacío, se muestra «No quedan pendientes» con un enlace a Buscar.

## Pruebas

- **Vitest:**
  - antojos por tipo y sus umbrales (incluidos los límites 240, 150, 10 y 480);
  - «lo que más espera» con conjuntos de 1, 3 y 10;
  - tramos combinados con antojo;
  - frases con rng fijo y su orden de prioridad;
  - el reducer: 3, 2, 1 y 0 elegibles, saltar, cerrar en cada fase y temporizadores cancelados.
- **Playwright** (contra build de producción): Inicio en escritorio → lomo-botón → antojo → tirar →
  descartar → «Me quedo con este» → CTA. Comprueba que la hoja se cierra, que la URL sigue siendo `/`
  y que el ítem está en «Continúa». Se adaptan `e2e/sorteo.spec.ts`,
  `e2e/ci/home-expandable.spec.ts` y los que usan `drawLink`.
- **Reduced motion:** un e2e con `reducedMotion: 'reduce'` que completa la partida.

## Fuera de alcance

- Abrir la partida en el sitio desde Biblioteca (`library-tools`).
- Precargar el pool al pasar el ratón (enfoque 3; se puede añadir encima sin cambiar nada).
- Sonido y vibración.
- Arte nuevo de la mascota.
- Criterios nuevos como género, saga o autor.
