# Ficha de saga para el lector, fase 1: evidencia

> **[Evidencia local · 2026-10-27]** Rama `claude/sagas-rework-11497e` (base `58cb7504`), PR pendiente. Diseño en
> [la spec](../superpowers/specs/2026-10-27-sagas-ficha-lector-design.md); decisiones en
> [`decisiones.md`](../requirements/decisiones.md) (entrada del 2026-10-27). Sin migraciones ni cambios de
> esquema. Producción no verificada.

## Qué se entrega

Hero cinemático, balda de pilas por subsaga, «Te toca», «Sobre la saga» y «Todas las obras» en `/saga/[id]`;
página interina `/saga/[id]/como-leerla`; `?tab=mapa` redirige allí. Fases 2 y 3 sin hacer (#1539, #1540).

## Unitarios

`npx vitest run src/lib/sagas src/components/saga src/lib/reactivity src/app/saga` (Node 22), repetido al
cerrar la rama: **50 ficheros, 631 tests, todo verde**. Hitos durante la implementación: 625 tests en 49
ficheros tras la tarea 8; `saga-curator-menu.test.tsx` (3 casos, 2 en rojo sin el arreglo) añadido con
`7aa80d36`. `npx tsc --noEmit -p .` y `npx eslint` de los ficheros tocados, limpios.

## e2e contra build de producción

`npm run build` + `npx next start -p 3000` arrancado a mano (regla #437: un `use cache` mal puesto pasa
`next build` y falla en `next start`; aquí no hay `use cache`, pero la suite sigue la regla).

Resultados de la rama (tras los arreglos, `retries 1`):

| Spec | Resultado |
|---|---|
| `sagas-ficha-lector` (nuevo, 8 casos) | 8/8 |
| `sagas-itinerarios` | 6/6 |
| `sagas-v2` | 4/4 |
| `sagas-v2-curacion` | 2/2 (con `7aa80d36`, `--retries 0`: 10 passed junto a ficha-lector) |
| `sagas-timeline-estados`, `sagas-v2-mapa`, `sagas-mapa-derivado`, `sagas-opcionales-saltables`, `sagas-roles`, `sagas-rol-narrativo`, `sagas-ventana-motivo-track`, `sagas-ventanas` | verdes (4/4, 4/4, 4/4, 4/4, 4/4, 3/3, 4/4, 2/2) |
| `sagas-colocacion-opcionalidad` | 4/6: fallan los 2 «CHECK de BD …», preexistentes |

Los e2e antiguos que leían `saga-hero-progress` o las pestañas se reescribieron (tabla de equivalencias en el
informe de la tarea 9); ninguna aserción se borró sin sustituir. El invariante #91 («el progreso no cambia al
cambiar de ruta») se retira a propósito: ahora el contador de la balda es el de la ruta activa y
`sagas-itinerarios` comprueba que **difiere** entre rutas.

### Comparación contra la base `58cb7504` (build y `next start` propios, `retries 0`)

| Test | Base | Rama | Veredicto |
|---|---|---|---|
| `colocacion-opcionalidad` «CHECK … hueco fijo» | falla | falla | preexistente (#1543) |
| `colocacion-opcionalidad` «CHECK … sin clasificar» | falla | falla | preexistente (#1543) |
| `editor-secuencia` móvil «zonas son botones» | falla | falla | preexistente (#1544) |
| `editor-secuencia` «guardar un borrador abierto antes…» | falla | falla | preexistente (#1544) |
| `orden-designado` «desdesignar…» | falla | falla | preexistente o dependiente de seed (#1545); en la base falla también «designar…», que en la rama pasa; en la base no existe `/como-leerla`, comparación poco informativa |
| `sagas-v2-curacion` «crear saga…» | pasa | falla | **regresión, arreglada en `7aa80d36`** |
| `sagas-opcionales-saltables` «2 · saltar tacha la fila…» | flaky | flaky | preexistente (#1546) |

Posible solape con #919 («20 e2e rojos sin atribuir contra build de producción»); no se ha verificado cuáles de
esos 20 son estos.

### La regresión de «crear saga»

Con `cacheComponents` Next no desmonta `/saga/[id]` al navegar a `/editar`: la oculta con `<Activity>`. El
`<dialog>` modal de `SagaCuratorMenu` seguía `open` y `:modal` en la top layer, invisible, y hacía inerte la
página siguiente (`elementFromPoint` sobre «Guardar cambios» devolvía `<html>`). Arreglo y regla en
`docs/TRAMPAS.md` §26; otros ~10 diálogos con el mismo patrón sin revisar: #1542.

## Verificación en navegador (controlador)

Sin sesión, contra la base de dev:

- 375 px: sin scroll horizontal.
- Los chips de ruta cambian la balda.
- Una pila se despliega y el foco vuelve a su sitio al cerrarla.
- `?tab=mapa&ruta=publicacion` redirige en el navegador a `/como-leerla?ruta=publicacion`. Con `curl` da 200 con
  `NEXT_REDIRECT` y `<meta refresh>` en el HTML (streaming con `loading.tsx`), no un 307 HTTP; ocurre igual con
  `notFound`.
- El filtro «Pendientes» de «Todas las obras» oculta las filas hechas: las variantes arbitrarias de Tailwind de
  `WorksFilter` (`[&_li[data-status=done]]:hidden`, y las de tipo) se emiten en el CSS.

## Hallazgos de datos y de comportamiento

- «La casa de los espíritus» con portada de «Das Geisterhaus» en «Te toca»: **datos del seed, no bug**. Son dos
  libros duplicados del catálogo de dev; título, enlace y portada son coherentes entre sí.
- Itinerario cuyo único paso es un bloque-subsaga dejaba la balda vacía: arreglado en `b4ef8bc0` (la balda vacía
  conserva cabecera) y `2fb3a352` (expande los bloques). El mismo fallo sigue en «Cómo leerla» (#1541).
- Tras guardar la ficha y volver con «atrás» se ve la sinopsis vieja 1-5 s: es la página preservada por
  `<Activity>` que se refresca sola; con carga dura sale la nueva. No es regresión.

## Qué NO se verificó

- **Estado autenticado de la ficha en el navegador:** solo se vio sin sesión; con sesión («Te toca», contadores,
  saltadas) solo hay cobertura e2e y unitaria.
- **Tema:** solo oscuro; el claro no se miró (el contraste del lomo sin portada y el degradado del hero quedan sin
  comprobar en claro).
- **Wrapper Android (Capacitor):** no se comprobó.
- **Capturas a 390 y 1440 px de qa-verifier:** no se hicieron; la verificación visual fue a 375 px y con
  `curl`/accesibilidad.
- **Producción:** nada desplegado; la fase 1 no toca esquema.
- Solape visual hero/balda al hacer scroll (un clic fue interceptado por el `<header>` del hero y la topbar
  sticky en un intento): sin confirmar como bug.

## Issues abiertas por esta fase

| # | Asunto |
|---|---|
| #1539 | Fase 2 de la ficha |
| #1540 | Fase 3 («Entre amigos») |
| #1541 | «Cómo leerla» no expande pasos-bloque |
| #1542 | `<dialog>` modal + Link bajo Activity (sospecha) |
| #1543 | e2e colocación: CHECK 409 vs 400 |
| #1544 | e2e editor de secuencia móvil |
| #1545 | e2e orden designado: «desdesignar» |
| #1546 | e2e flaky «saltar tacha la fila» |
| #1547 | 18 sagas «[QA Curación]» huérfanas en dev |
| #1548 | Pasada visual en tema claro y móvil (sospecha) |
| #1549 | Objetivos táctiles por debajo de 44 px |
| #1550 | Filtro de «Todas las obras»: contadores, vacío y orden |
| #1551 | `SagaDetail.progress` sin consumidor |
| #1552 | `loading.tsx` de la ficha también en las subrutas |

## Revisión final de la rama

- **I1:** con `show_map=false` la balda no ofrecía «Orden de lectura» y caía en un itinerario o en
  «Publicación». Ahora `shelfRoutesFor` (`src/lib/sagas/shelf-sections.ts`) antepone la sintética
  «lectura» solo en la ficha. Comprobado con `next start` contra dev: «[QA Sagas v2] Era Uno»
  (`/mapa` redirige a la ficha) pinta el chip «Orden de lectura» activo. `/como-leerla?ruta=lectura`
  degrada a la primera ruta de `detail.routes` (200, sin error).
- **I2:** una ventana que ya es «ahora» ya no se ofrece también como «Ahora encaja también».
- e2e `sagas-ficha-lector`, `sagas-itinerarios`, `sagas-v2` y `sagas-v2-curacion` contra el build de
  producción: 20/20.
