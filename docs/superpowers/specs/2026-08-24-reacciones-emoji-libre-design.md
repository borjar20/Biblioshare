# Diseño: reacciones con cualquier emoji, estilo Teams

- **Fecha**: 2026-08-24
- **Estado**: propuesta, aprobada para plan de implementación
- **Área**: `area:social`
- **Origen**: la paleta de reacciones está cerrada a cuatro valores (`like`, `read`,
  `shock`, `fire`). Se pide que en los chats se pueda reaccionar con cualquier emoji, como
  en Microsoft Teams. Decidido en la sesión de brainstorming: se abre en **todas** las
  reacciones de la app, no solo en los chats de club, porque `ReactionBar` es un único
  componente compartido y bifurcarlo costaría más que abrirlo entero.

## 1. Punto de partida

`reactions.kind` es `text` con un CHECK cerrado (`reactions_kind_valid`, migración
`20260837_reactions_kind_allow_palette.sql`) que solo admite `('like','read','shock','fire')`,
y un único `(interaction_target_id, user_id, kind)` que permite **varias reacciones
distintas por persona sobre el mismo target**.

En front, `ReactionsByKind = Record<ReactionKind, ReactionTally>` es un registro de claves
fijas que atraviesa `interactions.ts`, `interaction-optimistic.ts`, `reaction-bar.tsx`,
`feed.ts`, `get-community.ts`, `posts.ts` y `get-episode-reviews.ts`.

Radio de impacto real, medido: de esos ficheros, **casi todos solo mencionan el tipo o
llaman a `emptyReactions()`**. Únicamente dos indexan por las cuatro claves fijas —
`reaction-bar.tsx` e `interaction-optimistic.ts`. El resto es un rename mecánico.

Las notificaciones **no** dependen del `kind`: el tipo sale de
`interaction_targets.reaction_notification_type`, no del emoji. No se tocan.

## 2. Decisiones tomadas

| Decisión | Elegido | Alternativa descartada |
|---|---|---|
| Alcance | Todas las reacciones de la app | Solo chats de club (obligaba a bifurcar `ReactionBar`) |
| ¿Una o varias por persona? | **Varias**, como hoy, con tope de 6 | Una sola estilo Teams (exigía migrar datos y cambiar el único) |
| Catálogo | Dataset propio generado desde Unicode | `emoji-picker-element` (dependencia + tema visual ajeno + IndexedDB vs service worker) |
| Datos existentes | Migrar los 4 slugs a emoji | Traducir slug→emoji al pintar (dos representaciones para siempre) |
| Apertura | Fila rápida fija de 6 + botón «+» | Directo al catálogo; fila de «más usados» (queda como idea futura) |

## 3. Modelo de datos

`reactions.kind` sigue siendo `text` y pasa a guardar **el emoji literal** (`❤️`, `🔥`,
`👨‍👩‍👧`). No se añade ninguna columna — por tanto **no** aplica la superficie 6 de
`docs/DRIFT-CHECK.md` (grants por columna).

Migración `<timestamp>_reactions_emoji_libre.sql` (timestamp real al crearla), en este
orden:

1. **`drop constraint reactions_kind_valid` lo primero.** El CHECK viejo solo admite los
   cuatro slugs: si sigue vivo cuando corre el UPDATE, la migración **se viola a sí misma**
   (`ERROR 23514`). Verificado contra dev al implementar: el orden del borrador estaba mal.
2. **Dedup, aún antes del UPDATE.** Si un mismo `(interaction_target_id, user_id)` ya tiene
   `fire` **y** `🔥`, el UPDATE rompería el único. Se borran antes las filas con slug cuyo
   emoji destino ya existe para ese par.
3. `update public.reactions set kind = ...` con el mapa
   `like→❤️`, `read→📖`, `shock→😱`, `fire→🔥`.
4. Crear el CHECK nuevo, **de forma, no de lista blanca** — y **después** del UPDATE: puesto
   antes, rechazaría las filas que todavía son slugs.

   ```sql
   check (
     char_length(kind) between 1 and 16   -- 👩‍❤️‍💋‍👨 y 🏴󠁧󠁢󠁥󠁮󠁧󠁿 gastan 7-8; 16 deja aire
     and kind ~ '[^[:ascii:]]'            -- al menos un carácter no ASCII
     and kind !~ '[[:space:]]'
   )
   ```

   Rechaza `like`, `a`, `<script>`, cadena vacía y texto largo, sin enumerar emojis en SQL.
   **Ojo con la formulación ingenua** `kind !~ '[[:alnum:][:space:][:punct:]]'`: parece
   equivalente y no lo es — tumba los *keycap* (`1️⃣` es el dígito ASCII `1` + VS16 +
   U+20E3), que sí son emojis legítimos del catálogo. Por eso la condición es «contiene
   algo no ASCII», no «no contiene nada alfanumérico».
5. El único `(interaction_target_id, user_id, kind)` **no se toca**: sigue permitiendo
   varias reacciones distintas por persona.
6. **Tope de 6 emojis distintos por persona y target**, como trigger `before insert`. Sin
   él, emoji libre + varias por persona permite que una sola persona cuelgue 40 píldoras de
   un mensaje. La acción de servidor NO lo valida por su cuenta: solo traduce el 23514 del
   trigger a un `Error("reaction_cap_reached")` con identidad estable; el trigger es la
   única defensa real y la que no se puede saltar.

Coste visible asumido: `like` hoy se pinta `♡` (corazón de contorno) y pasa a `❤️`.

## 4. Tipos y estado en front

- `ReactionKind` y `REACTION_KINDS` **desaparecen**. En su lugar,
  `type ReactionEmoji = string` (alias documentado, no un tipo cerrado).
- `ReactionsByKind` se renombra a **`ReactionsByEmoji = Record<string, ReactionTally>`**,
  mapa **disperso**: una clave solo si alguien reaccionó con ese emoji. `emptyReactions()`
  devuelve `{}`.
- **La trampa principal del cambio**: indexar deja de ser seguro
  (`reactions["🔥"]` puede ser `undefined`). Se añade un helper único
  `tallyOf(reactions, emoji)` que devuelve `{count: 0, viewerReacted: false}` si falta, y
  **nadie indexa a pelo**.
- `reactionCount` y `viewerReacted` se derivan con `Object.values(...)` en vez de con una
  lista fija (`derive()` de `interaction-optimistic.ts`).
- `toggleKind` **borra la clave** cuando el recuento baja a 0, para que el mapa no acumule
  ceros que luego se pintarían como reacciones fantasma.
- Orden estable al pintar: recuento descendente y, a igualdad, **orden de primera
  aparición**. Sin desempate estable, dos emojis empatados bailan entre renders.
  **Corrección sobre el borrador**: la consulta de `reactions` en `interactions.ts` **no
  está ordenada hoy** (a diferencia de la de `comments`), así que la primera aparición no
  «ya viene dada». Hay que añadir `.order("created_at", { ascending: true })` a las dos
  consultas de reacciones (target y comentario). Con eso, el orden de inserción de claves
  del objeto **es** el orden de primera aparición — no hace falta guardar ningún `firstAt`.
- `getInteractionSummary` (`interactions.ts`) ya lee `r.kind` fila a fila; deja de
  necesitar el `?? "like"` y el cast, y acumula directamente en el mapa.

## 5. UI del `ReactionBar`

**Colapsado**: los **3** emojis más votados + el total. Hoy pinta *todos* los activos, lo
que con emoji libre desbordaría la burbuja. Sin reacciones, sigue el `🙂`.

**Popover**, de arriba abajo:

1. *Ya reaccionados* — píldoras de los emojis que ese mensaje ya tiene, con recuento,
   alternables: es el gesto de «sumarme a lo que hay» en un clic. Scroll horizontal si son
   muchas; la fila no aparece si no hay ninguna.
2. *Fila rápida fija* — `❤️ 📖 😱 🔥 😂 👏`.
3. *Botón «+»* al final de la fila rápida.

**Catálogo** (el «+»): **sustituye el contenido del popover**, no abre un segundo flotante
encima — en 360 px de ancho no cabe. En móvil, hoja inferior a ancho completo; en
escritorio, panel de ~320 px anclado al botón. Buscador arriba con foco automático, tira de
categorías, rejilla de 8 columnas.

**Sin virtualización, a propósito**: se pinta solo la categoría activa (la mayor, Smileys,
ronda 180 emojis) y la búsqueda corta en 100 resultados. Una ventana virtual para 1.900
botones es complejidad que este caso no paga.

**Accesibilidad** (hoy está a medias): `role="dialog"` con etiqueta, `aria-label` por botón
con el nombre en español del emoji, `aria-pressed` en los que ya tienes, **Escape cierra**
(hoy solo hay backdrop) y el foco vuelve al botón al cerrar. Sin `useEffect`, respetando la
regla de lint del repo (`set-state-in-effect`) que ya forzó el backdrop actual.

**El tope de 6 se ve, no se sufre**: alcanzado el tope, los emojis nuevos salen
`disabled` con el motivo en el `title`; los tuyos siguen quitables. Sin esto, el usuario
pulsa y no pasa nada.

**Carga diferida**: el catálogo entra por `next/dynamic`, para que el JSON no viaje en el
bundle del feed sino solo al abrir el selector.

`onToggle(emoji)` mantiene el contrato optimista actual; el resto de componentes no se
enteran del cambio.

## 6. Catálogo de emojis y validación

`scripts/build-emoji-dataset.mjs` cruza dos fuentes Unicode oficiales:

- `emoji-test.txt` — qué emojis existen, en qué grupo, y cuáles son *fully-qualified* / RGI.
- CLDR `annotations/es` — nombre y sinónimos **en español**, para que buscar «fuego»
  encuentre 🔥 y no solo «fire».

Salida: `src/lib/social/emoji-catalog.data.ts`, **commiteado al repo**. El script sirve para
regenerarlo cuando Unicode saque versión; **no** es un paso de build, así que ni CI ni
`next build` dependen de la red.

Recorte: solo RGI fully-qualified, sin variantes de tono de piel (se lista el base), sin el
grupo *Component*. Quedan 1.906 entradas de forma `{e:"🔥", n:"fuego", k:["llama","caliente"], g:4}`.
Claves de una letra a propósito: 153 KB en crudo, ~30 KB comprimido, y solo se descarga al
abrir el selector.

**Validación en servidor: lista blanca contra el catálogo, no regex.**
`toggleReaction(targetId, emoji)` rechaza cualquier cosa que no esté en el catálogo. Es más
estricto que `/^\p{RGI_Emoji}$/v` y da la garantía que importa: *todo lo guardado en
`reactions.kind` se puede pintar y nombrar*. Con solo regex, cualquiera puede meter por la
acción de servidor un ZWJ raro que en un móvil sale como dos monigotes y no tiene
`aria-label`. El catálogo pesa en el servidor, no en el cliente.

Orden de defensas, de fuera a dentro: **catálogo** (acción de servidor) → **CHECK de
forma** (Postgres) → **tope de 6** (trigger).

**Buscador**: normaliza sin tildes y sin mayúsculas, casa por prefijo en nombre y
sinónimos, ordena primero coincidencia exacta y luego por posición del prefijo. Sin
librería de *fuzzy*.

## 7. Pruebas

**Corrección importante sobre el borrador: en `main` NO hay runner de componentes.**
`vitest.config.ts` de `main` incluye solo `src/**/*.test.ts` con entorno `node`, y
`package.json` no trae `@testing-library/react` ni `jsdom`. El runner de `.test.tsx` existe
únicamente en la rama **sin mergear** `fase-c-estadisticas-nuevas`, que es donde lo vi. El
comentario de `reaction-bar.test.ts` sigue siendo cierto hoy.

**Decisión: no se añaden esas dependencias en esta PR.** Montar jsdom aquí duplicaría un
cambio de `package.json` + lockfile que otra rama viva ya hace, y el conflicto al mergear
costaría más que lo que aporta. En su lugar:

- La lógica de pintado que quiere prueba **se extrae a funciones puras** en
  `src/lib/social/reaction-display.ts` (resumen top-3, orden estable, tope alcanzado), y se
  prueban con `vitest` en entorno `node`, sin DOM. Es lo que el repo ya hace en todas
  partes.
- El comportamiento de clic, foco y `aria-*` lo cubre el **e2e de Playwright**.
- Cuando `fase-c-estadisticas-nuevas` aterrice en `main`, se añaden los `.test.tsx` de
  `ReactionBar` encima. Queda como issue (`tipo:cobertura` / `area:social`), no como
  pendiente suelto.

**Unitarias (`node`):**

- `emoji-catalog`: carga, sin duplicados, toda entrada con nombre no vacío, y los 6 de la
  fila rápida + los 4 emojis migrados existen en él. Es la prueba que detecta una
  regeneración rota.
- `isAllowedEmoji`: acepta `❤️`, `👨‍👩‍👧` y el keycap `1️⃣`; rechaza `"like"`, `"a"`, `""`,
  `"🔥🔥"`, `"<script>"`. El keycap es el caso que distingue el CHECK correcto del ingenuo
  (§3), así que va también como prueba de la migración en SQL.
- Buscador: «fuego» → 🔥 primero; sin tildes («corazon») encuentra ❤️; corta en 100.
- `interaction-optimistic`: alternar un emoji nuevo crea la clave; quitarlo **la borra** (no
  deja `count: 0`); `reactionCount` / `viewerReacted` se derivan bien con mapa disperso.
- Orden del resumen: por recuento y, en empate, por primera aparición.

**De pintado, sin DOM** (`reaction-display.ts`, entorno `node`) — sustituye al
`reactionMeta` estático: `summarize()` corta en 3 y da el total correcto; `capReached()`
dice si el viewer llegó a 6 en ese target; el orden empatado respeta la primera aparición.

**E2E (Playwright)**: reaccionar con un emoji del catálogo en un chat de club (abrir, «+»,
buscar, elegir, ver recuento) y sumarse a un emoji existente desde la fila de
ya-reaccionados.

**Migración**: se prueba contra `supabase-dev` con un caso de colisión sembrado a
propósito (mismo `(target, user)` con `fire` y `🔥`) para verificar que el dedup corre antes
del UPDATE. Dev primero, prod después.

## 8. Definición de hecho

- `docs/requirements/data-model.md`: `reactions.kind` pasa de paleta cerrada a emoji
  literal; documentar el CHECK de forma y el trigger de tope 6; actualizar fecha de
  verificación.
- `docs/requirements/decisiones.md`: entrada al final con las tres decisiones que no se leen
  en el código — emoji literal en `kind` en vez de tabla de catálogo, varias reacciones por
  persona con tope 6, y lista blanca contra catálogo en vez de regex.
- `docs/requirements/backlog.md`: **no hay ítem de reacciones** (comprobado el 2026-08-24
  con `grep -i reaccion`), así que no hay casilla que marcar. Nada que hacer aquí.
- Issues a abrir:
  - `tipo:cobertura` / `area:social` — cuando `fase-c-estadisticas-nuevas` mergee y `main`
    tenga runner de `.test.tsx`, añadir tests de componente de `ReactionBar` (clic, `aria-
    pressed`, Escape, foco). Hoy eso lo cubre solo el e2e.
  - `tipo:feature` / `area:social` — fila rápida con «tus más usados» (guardada en el
    navegador) en vez de fija.

## 9. Fuera de alcance

- Una reacción por persona (estilo Teams estricto).
- Tonos de piel y emojis personalizados del club.
- Realtime de reacciones: sigue siendo optimista + recarga, como hoy.
- Quién reaccionó (lista de personas al pasar el ratón).
