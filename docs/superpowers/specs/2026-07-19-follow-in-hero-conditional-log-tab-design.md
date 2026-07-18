# «Seguir» en el hero + tab «Mi registro» condicional

**Fecha:** 2026-07-19
**Estado:** aprobado (pendiente de plan de implementación)

## Problema

Hoy, para seguir una obra (añadirla a la biblioteca) hay que abrir la pestaña
**Mi registro** de la ficha: el botón **«Seguir»** vive dentro de `LogPanel`
(rama `!entry`). Eso lo esconde tras un clic de pestaña — poco accesible para la
acción principal de la ficha. Además la pestaña «Mi registro» siempre está
visible aunque no haya nada que registrar (ningún pase del ítem).

## Objetivo

1. Mover **«Seguir»** al **hero**, donde es visible desde cualquier pestaña.
2. La pestaña **«Mi registro»** solo aparece cuando el ítem tiene un pase (está
   seguido); queda oculta si no.

## Decisiones tomadas (brainstorming)

- **Edición al seguir → diferida.** El botón «Seguir» actual, con libros de
  varias ediciones, abre inline un selector «¿Qué edición tienes?». El hero se
  renderiza fuera del `<Suspense>` de las pestañas y **no** tiene las ediciones
  cargadas (llegan por streaming). En vez de cargarlas también en el hero, el
  hero añade la obra directa como «Pendiente» y la pregunta «¿qué edición?» se
  queda donde ya vive hoy: al empezar a leer (panel Progreso, `PassDataPanel`).
- **Tras seguir → revelar Y saltar** a «Mi registro», para gestionar
  estado/progreso enseguida.

## Comportamiento

| Situación | Hero | Barra de pestañas |
|---|---|---|
| Sin seguir (`status === null`) | Botón **«Seguir»** | `Información`, `Comunidad` (+ `Episodios` en series). **Sin** «Mi registro». |
| Al pulsar «Seguir» (optimista) | Cambia a la píldora **«Pendiente»** | Aparece **«Mi registro»** y se salta a ella. |
| Ya seguido | Píldora de estado (como hoy) | «Mi registro» visible. |
| Anónimo | «Seguir» → `/login` | Sin badge optimista falso. |

## Arquitectura y componentes

Fuente única de verdad reactiva: `ItemStatusContext` (`item-status-context.tsx`).
Ya alimentaba el badge del hero; ahora alimenta también el botón «Seguir» del
hero y la visibilidad de la pestaña «Mi registro». `status === null` = no
seguido / no en biblioteca. Nadie recalcula ese estado por su cuenta.

### 1. `HeroStatusOrFollow` (nuevo, cliente)

Vive en el `statusSlot` del hero (ya bajo `ItemStatusProvider`). Con
`useItemStatus()`:

- `status === null` → botón **«Seguir»** (con estado `pending`).
- `status !== null` → el `StatusBadgeLive` de hoy.

Al pulsar «Seguir» (logueado):
1. `setStatus("planned")` — optimista: el hero swap a badge, la pestaña aparece.
2. `router.replace(\`${pathname}?tab=log\`)` — canal hero→tabs vía URL, que
   `ItemDetailTabs` ya vigila.
3. `startTransition(() => addExistingItemToLibrary(itemType, itemId))`.

Anónimo (`isLoggedIn === false`): el clic navega a `/login`, sin `setStatus`.

Props: `itemType`, `itemId`, `isLoggedIn`, `statusLabels` (los 4 de hoy),
`followLabel`, `followingLabel`.

`StatusBadgeLive` queda absorbido/reutilizado por este componente (o
`HeroStatusOrFollow` lo envuelve). La página deja de pasar `StatusBadgeLive`
directo y pasa `HeroStatusOrFollow` como `statusSlot`.

### 2. `item-detail-tabs.tsx` (modificar)

- Lee `useItemStatus().status`.
- Incluye `"log"` en `order` y `slots` **solo si** `status !== null`.
- El `initialTab`/seguimiento de `?tab=` externo se **clampa** a las pestañas
  disponibles: si `?tab=log` pero el ítem no está seguido, cae a `info`. Esto
  cubre la carga directa de `/libro/x?tab=log` de un ítem no seguido.
- Cuando se sigue (status pasa a no-null) y la URL ya trae `?tab=log` (lo pone
  el hero), el efecto de seguimiento de `?tab=` existente conmuta a la pestaña.

### 3. `log-panel.tsx` (modificar)

- La rama `!entry` deja de renderizar `FollowButton`. Pasa a un **placeholder
  de carga** ligero: la única forma de estar en la pestaña «Mi registro» ahora
  es haber seguido (o estar siguiendo optimista con `entry` aún llegando por
  revalidación) — ventana transitoria, no un estado estable.
- Se elimina el componente interno `FollowButton` (con su selector de edición)
  y `writeEditionChoice` (la escritura en `localStorage` de la edición elegida
  al seguir), ya sin llamador.

### 4. i18n

Reutiliza `item.follow` / `item.following` (ya existen). Sin claves nuevas.
(Posible clave nueva para el placeholder de carga si hace falta texto; si es un
spinner sin texto, ninguna.)

### 5. e2e (`e2e/pase-hub.spec.ts`)

- `followItem()` pasa a pulsar «Seguir» en el **hero** (visible desde cualquier
  pestaña) y **deja de** gestionar el prompt «No lo sé» (desaparece al diferir
  la edición).
- Los specs que hacen `goto('…?tab=log')` sobre un ítem aún no seguido: tras la
  carga caerán en `Información` (log oculto), pero el hero «Seguir» sigue
  accesible y tras seguir se salta a `log`, así que las aserciones posteriores
  de contenido del registro siguen valiendo. Revisar/ajustar cada uso.

## Cabos sueltos / notas

- El `useEffect` de `PassDataPanel` que aplicaba la edición elegida-al-seguir
  (`editionChoiceStorageKey`) queda **inerte** (nunca encontrará elección).
  Se deja como no-op inofensivo para no expandir el alcance a ese componente
  (decisión revisable).
- Parpadeo breve posible al saltar a «Mi registro» mientras el servidor
  revalida el contenido del pase; el placeholder de carga lo suaviza.

## Verificación

- `tsc --noEmit` y `eslint` limpios.
- e2e: el ciclo de vida del libro (alta desde el hero → auto-cierre → relectura
  → borrar pase) sigue verde; añadir aserción de que «Mi registro» no está
  visible antes de seguir y sí después.
- Comprobación en navegador (skill `verify`/`qa-verifier`): seguir desde el hero
  en libro/película/serie, tab aparece y se salta a ella, badge cambia.

## Fuera de alcance

- Rediseño visual del hero más allá de alojar el botón.
- Cambiar el flujo de edición en el panel Progreso (se mantiene tal cual).
- Limpiar el lado lector de la elección-de-edición-al-seguir en `PassDataPanel`.
