# Vista de actividad de club en PC — homogeneización con el shell del club

[Histórico · congelado 2026-07-21] Spec de diseño. El estado de hoy manda en el código;
esto explica el *porqué* de la forma elegida.

Mockup de referencia: `Biblioshare_mockups/Paper - Actividades PC.html` (frames 1–4).
Mockup móvil vigente: `Biblioshare_mockups/Paper - Clubes.html` (frames 4, 5, 7, 8).

## El problema

Las vistas internas de una actividad quedaron descuadradas respecto al resto del club.
No es un problema de estilo, es estructural:

- `/club/[slug]` y `/club/[slug]/miembros` montan `ClubShell` — sidebar de 256px + main.
- `/club/[slug]/actividad/[id]` **no**: es una columna suelta `max-w-2xl` centrada
  (`page.tsx:37`). En PC pierde el sidebar del club, queda estrecha, y no tiene la
  cabecera sticky con el título y las acciones.

El mockup PC además parte el cuerpo en dos columnas (`1fr / 296px`) y lleva al rail
derecho piezas que hoy viven dentro de cada tablero.

## Decisión 1 — la página entra en `ClubShell`, pero la cabecera NO usa `desktopHeader`

`actividad/[id]/page.tsx` monta `ClubShell` con `ClubSidebar` (`active="actividades"`).
Necesita `listClubActivities` para el pip de propuestas pendientes del sidebar, igual
que hace ya `miembros/page.tsx`.

La cabecera es la trampa. El slot `desktopHeader` de `ClubShell` se pinta con
`hidden … lg:block`: sirve para el *chrome de navegación*, que sí se desdobla (pestañas
en móvil vs sidebar en PC, elementos distintos que no chocan). Pero la barra de acciones
—Salir, Modificar, Finalizar, Archivar— es **el mismo control** en las dos anchuras. Si
se pone en `desktopHeader` y se deja en el cuerpo para móvil, quedan dos botones «Salir»
en el DOM, y `e2e/club-activity-changes.spec.ts:137` los busca por rol y nombre: dos
coincidencias es un *strict mode violation* de Playwright. El test rompe.

Por eso la cabecera (enlace de vuelta + título + acciones) se renderiza **una sola vez,
dentro del contenido**, con `sticky lg:top-[var(--topbar-h)]` para que en PC se pegue
como en el mockup y en móvil fluya normal. No se pasa `desktopHeader` al shell.

Único desdoble admitido, y solo de texto: el enlace de vuelta muestra el nombre del club
en móvil y «Actividades» en PC, con dos `<span>` por breakpoint dentro de **un solo**
`<Link>`. Se duplica texto, no controles — `getByRole("link")` sigue encontrando uno.

## Decisión 2 — tres ranuras, no dos columnas

La trampa: el mockup **móvil** (frames 4 y 5 de `Paper - Clubes.html`), que hoy sí se
cumple, intercala las piezas alrededor del tablero:

```
chip → título → participantes → acciones → Tu progreso → TABLERO → clasificación
```

En PC, «Tu progreso» y «clasificación» saltan al rail derecho. Es decir: las mismas
piezas cambian de posición **relativa al tablero** según el breakpoint, no solo de
columna. Eso descarta las dos soluciones fáciles:

- Un `<aside>` con `lg:order-2` (el patrón del feed del club) agruparía en móvil,
  arriba del tablero, cosas que el mockup pone antes y después.
- Duplicar DOM con `hidden lg:block` está vetado por la nota sobre duplicados de
  `club-shell.tsx`: *«no hay duplicados que confundan a los locators de la suite
  (que corre a 1280 = lg)»*.

El contrato es de tres ranuras:

| ranura | móvil | PC |
|---|---|---|
| `railTop` | antes del tablero | arriba del rail derecho |
| `body` | el tablero | columna izquierda |
| `railBottom` | después del tablero | debajo en el rail |

Un solo DOM. El orden del DOM es el móvil (flujo natural); en `lg` un grid explícito
reordena: `railTop` → col 2 / fila 1, `body` → col 1 / filas 1–2, `railBottom` →
col 2 / fila 2.

Consecuencia asumida: al ser dos celdas separadas, el rail no puede ser un único bloque
`sticky` como en el feed del club. Se acepta — el rail de una actividad es corto.

Otra consecuencia conocida de la misma decisión: el orden del DOM es el móvil, así que en
`lg` el orden de TABULACIÓN sigue siendo ese orden del DOM, no la disposición visual del
grid (que en `lg` pone el cuerpo a la izquierda y el rail a la derecha). Así, en la tierlist
se tabula rail-arriba → cuerpo → rail-abajo (railTop → body → railBottom), aunque
visualmente el cuerpo esté primero. Se acepta por el mismo motivo que el resto de la
decisión 2: partir el DOM por breakpoint para que la tabulación siguiera lo visual
reintroduciría el problema que la decisión 2 evita (duplicar controles).

## Decisión 3 — el tablero sigue siendo un solo componente

Los cuatro tableros derivan de **un solo fetch en estado local** todas las piezas que hay
que repartir. Ejemplo canónico, `list-challenge-board.tsx:44`: un único `view` alimenta el
resumen (rail), la rejilla (cuerpo) y el ranking (rail). Lo mismo en los otros tres.

Partir un tablero en dos componentes duplicaría el fetch o exigiría levantar el estado.
Así que **no se parte**: `DetailExtension` recibe una prop nueva `Layout` (render prop) y
el tablero, sin dejar de ser uno solo, reparte su propio JSX:

```tsx
return <Layout
  railTop={<ListChallengeSummary … />}
  body={<>{grid}{matriz}{regla}</>}
  railBottom={<>{ranking}<LinkedActivities …/></>}
/>;
```

`ActivityDetailView` provee ese `Layout` y añade al rail sus piezas comunes
(participantes).

### Reparto por tipo

| tipo | `railTop` | `body` | `railBottom` |
|---|---|---|---|
| `buddy_read` | Tu progreso | lista de hitos + chats | próximo hito |
| `list_challenge` | Tu avance | rejilla + matriz + regla | clasificación + actividades conectadas |
| `tierlist` | conmutador de participantes + `<h2>` del tablero (Tu tierlist / La de X) | tiers + pool + selector táctil | — |
| `criteria_challenge` | chip de modo + anillo | «quién aporta» (ranking) | regla del reto |

«Próximo hito» se deriva del primer checkpoint no alcanzado de la vista que el tablero ya
carga. No hace falta dato nuevo.

El ranking de `criteria_challenge` se queda en el cuerpo: así lo pone el frame 4 del
mockup PC, a diferencia del de `list_challenge`.

## Fuera de alcance: el mockup dibuja tres cosas que el proyecto decidió no tener

No se implementan. Las tres van a issue para que no se reintenten a ciegas leyendo solo
el mockup.

1. **«Consenso del club» de la tierlist.** `tierlist.ts:19` lo descarta explícitamente:
   *«promediar los tiers aplanaría justo el desacuerdo, que es el punto de una
   tierlist»*.
2. **«Compartir la mía al feed» / «Ya compartieron · 24».** La tierlist no tiene concepto
   de compartir: `tierlist-board.tsx:145` ya muestra la de cada participante con un
   conmutador, visible para todos ellos.
3. **«Aporta tu avance · + Registrar uno»** del reto genérico.
   `criteria-challenge-board.tsx:15`: *«Sin botón de "marcar": el progreso sale de los
   pases de diario, no hay nada que pulsar aquí»*.

Precedente de la misma familia, ya documentado en el código: el `modeseg` conmutador que
el mockup dibuja para el reto genérico se pinta como chip estático, porque el modo es
config congelada de la actividad (`criteria-challenge-board.tsx:17-19`).

## Verificación

- `vitest` aquí es solo para funciones puras en Node (`vitest.config.ts`: `include:
  ["src/**/*.test.ts"]`, sin DOM). **No hay tests de componentes**, así que la única
  pieza con test unitario es la derivación del próximo hito; el resto se verifica con
  Playwright y a ojo en las dos anchuras.
- `e2e/club-activity-changes.spec.ts` debe seguir pasando **sin tocarlo**. Es el canario
  del DOM duplicado: busca «Salir», «Modificar», «Finalizar» y «Archivar» por rol.
- La suite e2e corre a 1280 = `lg` (`devices["Desktop Chrome"]`), así que ejercita el
  camino de PC. Los locators no deben ver DOM duplicado — es la razón de la decisión 2.
- Comprobar los cuatro tipos en las dos anchuras, y en los tres estados de espectador que
  ya distingue `activity-detail.tsx`: participante, no participante de una activa
  (vista previa con teaser), y moderador.
- El orden móvil se conserva para `tierlist` y `criteria_challenge`. En `list_challenge` y
  `buddy_read` cambió, y se ACEPTÓ el cambio (revisión final de rama, 2026-07-21):
  - `list_challenge`: antes la clasificación iba entre la rejilla y la matriz; ahora va
    después de la matriz y del párrafo de regla (rejilla → matriz → regla →
    clasificación → actividades conectadas).
  - `buddy_read`: antes el `<h2>` «Hitos» precedía a «Tu progreso»; ahora la tarjeta de
    «Tu progreso» va primero, y se añade «Próximo hito» al final (Tu progreso → Hitos →
    Próximo hito).
  Los dos encajan con la tabla de reparto de la decisión 3 y con el mockup PC; el criterio
  de que la decisión 2 se aplicó bien no es la identidad byte a byte del DOM, sino que cada
  ranura recibió exactamente las piezas de esa tabla.

## Sin cambios de esquema

Ninguna migración. Ningún dato nuevo: todo lo que va al rail ya lo cargan los tableros.
