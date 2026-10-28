---
title: Ficha de saga para el lector (rework de sagas, subproyecto 1)
date: 2026-10-27
status: fase 1 implementada (rama claude/sagas-rework-11497e, PR pendiente); fase 2 implementada (rama claude/sagas-ficha-fase-2, PR pendiente); fase 3 implementada (rama claude/sagas-ficha-fase-3, PR pendiente)
area: sagas / ui
---

# Ficha de saga para el lector

> Maquetas de referencia (fragmentos del compañero visual del brainstorming, sin el marco):
> [`assets/sagas-ficha-lector-maqueta.html`](assets/sagas-ficha-lector-maqueta.html) (página
> entera, escritorio y móvil) y
> [`assets/sagas-ficha-lector-complejidad.html`](assets/sagas-ficha-lector-complejidad.html)
> (cómo expresa la balda ventanas, tándems, roles e itinerarios; la opción elegida es la A).

## Problema

La ficha `/saga/[id]` se ha quedado atrás respecto a la ficha de obra cinemática
([spec 2026-09-23](2026-09-23-ficha-cinematica-design.md)) y al atlas de Entre nosotros
([spec 2026-10-13](2026-10-13-entre-nosotros-atlas-design.md)):

- **Visual:** contenedor `max-w-5xl`, hero centrado con un abanico de cuatro portadas, y dos
  pestañas (Info | Mapa de lectura).
- **Como lector:** no contesta de un vistazo cómo está montada la saga, qué te toca ni cuánto
  llevas. Las capas añadidas entre julio y agosto (ventanas, tándems, roles, opcionales,
  itinerarios, mapa 2D) se ven todas al mismo nivel en el timeline.

## Rework de sagas: tres subproyectos

Este documento cubre solo el **1**. Los otros dos llevan su propia spec, su plan y su PR.

1. **Ficha de saga para el lector** (este documento).
2. **El mapa de la saga como atlas.** Lienzo con zoom y lentes (orden, rol, itinerario,
   progreso) que sustituye al grafo 2D de `/saga/[id]/mapa`.
3. **Atlas de sagas y universos.** El índice `/sagas` deja de ser una rejilla y pasa a ser un
   mapa navegable.

## Decisiones (brainstorming 2026-10-27)

| Pregunta | Elegido | Descartado |
|---|---|---|
| Qué resuelve primero la ficha | 1) cómo está montada (el orden) · 2) qué toca · 3) cuánto llevas | — |
| Estructura del orden | **Estantería horizontal** de portadas | Lista con capítulos y tarjeta flotante; recorrido vertical con raíl |
| Ventanas, tándems, roles, itinerarios | **La balda los expresa a su manera; el porqué, en el atlas** | Ficha mínima (todo al atlas); timeline detallado bajo la balda |
| Saga larga | **Pilas por subsaga, la tuya desplegada, más una minibarra para saltar** | Solo balda continua desplazable; una balda por subsaga apiladas |
| Bloques bajo la balda | Todos: Sobre, Tu paso, Entre amigos, Subsagas, Atlas, Todas las obras | — |

## Diseño

### 1. Página, de arriba abajo

Un único árbol responsive (sin hero de móvil y cabecera de PC por separado), en el contenedor
ancho de la ficha cinemática.

1. **Hero cinemático.** Las sagas no tienen backdrop: el fondo es un mosaico difuminado de las
   portadas de sus obras, con un velo. Si es una saga de TMDB con películas, se usa el backdrop
   real de la primera película que lo tenga. Encima: eyebrow (`Universo · N obras · M
   subsagas`), título, byline, años, media y Seguir. Las acciones de curador (editar ficha,
   secuencia, itinerarios) pasan a un menú «⋯» en el hero, en lugar de los enlaces sueltos de
   hoy en Info. Si la saga tiene padre, el chip «Parte de X» se mantiene.
2. **El orden** (§2).
3. **Te toca + Entre amigos**, lado a lado en PC y apilados en móvil. Los dos contestan «¿por
   dónde voy?».
4. **Sobre la saga.** Sinopsis y una columna de datos: obras, tipos, años, media y curador.
   Rejilla `1fr | 340px`, como la Info de la ficha de obra.
5. **Tu paso por la saga.** Curva de tus notas obra a obra en el orden activo, desde cuándo, cuántas
   obras y páginas, y tu favorita.
6. **Subsagas.** Tarjetas de las hijas con su progreso, que sirven de puerta de entrada.
7. **Acceso al atlas.** Tarjeta con una vista previa del grafo que enlaza a `/saga/[id]/mapa`
   hasta que exista el subproyecto 2.
8. **Todas las obras.** Rejilla de referencia con filtro por tipo y estado. Hereda el papel de
   la rejilla de miembros de la Info actual.

### 2. La balda

- **Chips de itinerario** encima, solo si hay más de uno. Se mantiene la precedencia actual de
  ruta activa (`?ruta=`, compatibilidad con `?orden=publicacion`, ruta adoptada y primera). Un
  slug desconocido degrada a la primera.
- **Pilas por subsaga:** las terminadas y las futuras se comprimen en una pila de portadas con
  su recuento (`I · 6/6 ✓`, `IV · 12`). La subsaga en curso se despliega como balda, con la
  obra de «ahora» más grande y marcada. Al tocar una pila se despliega esa subsaga en lugar de
  la anterior. En una saga sin subsagas no hay pilas: solo la balda.
- **Minibarra** bajo la balda: un segmento por subsaga, de ancho proporcional a sus obras,
  relleno con lo leído y marcado con lo que toca. Tocar un segmento despliega esa subsaga.
- **Ventana:** portada flotante sobre el tramo donde encaja, con un arco discontinuo del color
  `map-window` que abarca de la posición inicial a la final.
- **Tándem:** dos portadas solapadas con contorno `map-tandem`.
- **Rol:** etiqueta pequeña sobre la portada (spin-off, precuela…), con el vocabulario de
  `RoleChip`.
- **Opcionales:** al final de su subsaga, tras un separador, en tamaño menor. Se respeta la
  preferencia global `show_optional_readings`.
- **Sin portada:** lomo de color con el acento de la subsaga (`SAGA_ACCENT`).

### 3. Te toca

La siguiente obra del itinerario activo, con portada, título, posición, botón de acción y
«Saltar» si es opcional. Si en ese momento encaja una ventana, se avisa: «ahora encaja también
X». Variantes:

- **Sin sesión:** «Empieza por…» con la primera obra.
- **Saga terminada:** «La terminaste», con tu nota media.
- **Todo opcional:** el texto actual `allOptional`.

### 4. Datos

**Se reutiliza sin cambios** `getSagaDetail`, que trae en un batch grupos, progreso,
itinerarios, ventanas, roles, ruta adoptada y seguir. También `resolve-route` y
`derive-timeline`, que producen las `TimelineSection` de la ruta activa. **No hay migraciones
ni cambios de esquema.** Si alguno resultara necesario, se para y se consulta.

**`deriveShelf`** (`src/lib/sagas/derive-shelf.ts`) es una función pura nueva que toma las
`TimelineSection` de la ruta activa y el progreso del lector, y devuelve:

- las subsagas, cada una con estado `terminada | en curso | futura`, su recuento y sus
  portadas de pila;
- para cada subsaga, sus posiciones: obra simple, tándem (dos obras) o ventana (obra más
  tramo `desde–hasta`), cada una con estado `leída | ahora | futura`, rol y si es opcional;
- la siguiente obra y la ventana que encaja en ese momento, si la hay;
- los segmentos de la minibarra.

Toda la lógica difícil vive aquí. Los componentes solo pintan.

**Dos lecturas nuevas.** Las dos dependen de la sesión, así que van **sin `use cache`**
(regla #437) y detrás de `<Suspense>`, para no frenar el hero:

- **Entre amigos:** las personas a las que sigues (`src/lib/social/follows.ts`) que siguen la
  saga o tienen pases en sus obras, por dónde va cada una y su nota. La visibilidad la da RLS
  sobre `passes`: lo que el que mira no puede ver no aparece. Si no hay nadie, el bloque no se
  pinta.
- **Tu paso:** tus pases (`passes`, nunca `library_entries`) en las obras de la saga, con
  fechas, notas y páginas.

### 5. Componentes

En `src/components/saga/ficha/`: `SagaHeroCinematic`, `SagaShelf` (isla cliente solo para
desplegar pilas, saltar con la minibarra y el teclado), `NextUpCard`, `FriendsOnSaga`,
`SagaAbout`, `YourPassage`, `SubsagaDoors`, `AtlasTeaser` y `SagaAllWorks`.
`src/app/saga/[id]/page.tsx` pasa a ser una composición plana de estos bloques.

**Se retiran de la ficha** `SagaTabs`, `SagaInfo` (su rejilla pasa a `SagaAllWorks`),
`SagaMapTab` y el hero actual.

El timeline detallado, el grafo embebido, adoptar un itinerario, saltar opcionales y la lente
`?rol=` solo vivían en la pestaña Mapa. `/saga/[id]/mapa` no los tiene. Por eso se mudan sin
cambios a una página **interina**, `/saga/[id]/como-leerla`, que el atlas (subproyecto 2)
sustituirá. `?tab=mapa` de enlaces viejos redirige allí conservando `ruta`, `orden` y `rol`, y
la balda enlaza a ella como «Cómo leerla →». (Ajuste hecho al escribir el plan, 2026-10-27.)

La balda usa el grafo derivado aunque el curador haya apagado `show_map`
(`SagaDetail.shelfGraph`): el interruptor esconde el mapa, no el orden.

### 6. Móvil y accesibilidad

- La balda se desliza en horizontal con snap y se abre centrada en «ahora». Las pilas se
  despliegan con un toque. Los objetivos táctiles miden al menos 44 px. Mismo comportamiento en
  el wrapper Android.
- **Lista accesible equivalente** a la balda (el mismo patrón que el §7 del atlas de Entre
  nosotros): una `ol` del orden con estado, rol, ventana y tándem en texto.
- Teclado: las flechas recorren la balda y Enter abre la obra.
- Ninguna señal depende solo del color: leída y ahora llevan icono o texto además del contorno.

## Pruebas

- **Unitarias de `deriveShelf`:** saga simple, universo con cinco subsagas, ventana en el tramo
  actual, tándem, rol, opcionales ocultas, todo opcional, terminada, sin sesión e itinerario
  alternativo.
- **Unitarias de las dos lecturas nuevas** con mock de Supabase, incluido que un pase que RLS no
  devuelve no aparezca.
- **e2e contra build de producción** (regla #437): la ficha abre centrada en «Te toca», cambiar
  de chip cambia la balda, desplegar una pila, la minibarra salta y `?tab=mapa` redirige.
- **Verificación visual** en móvil y escritorio con qa-verifier.

## Fases de entrega (una PR cada una)

1. `deriveShelf`, hero cinemático, balda, «Te toca», «Sobre la saga» y «Todas las obras». La
   ficha nueva sustituye a la vieja en esta fase.
2. «Tu paso por la saga», «Subsagas» y el acceso al atlas. Cierra **#761** (progreso por
   saga).
3. «Entre amigos».

## Fuera de alcance

- Los subproyectos 2 (atlas de la saga) y 3 (atlas del índice `/sagas`).
- Las issues abiertas de `area:sagas`, salvo #761. Si una fase deja obsoleta alguna (por
  ejemplo, las del timeline que deja de verse en la ficha), se dice en el cierre de la PR y se
  revisa issue a issue.
- El lado del curador (editor de secuencia e itinerarios): solo cambia dónde están sus
  accesos.

## Al cerrar cada fase

- Backlog: marcar la casilla correspondiente.
- `decisiones.md`: añadir la entrada de la estructura en balda y de la retirada de las pestañas
  Info y Mapa de la ficha.
- `docs/architecture/graph.json`: el flujo de la ficha de saga cambia de nodos.
