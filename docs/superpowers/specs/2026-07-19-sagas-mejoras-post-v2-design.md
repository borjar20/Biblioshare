# Sagas · mejoras post-v2 (diseño)

> Lote de 4 mejoras sobre el sistema Sagas v2 ya completo (fases 1–5 en main).
> Decididas con el usuario el 2026-07-19 a partir de una captura móvil y su
> feedback de uso. Sin migraciones de BD.

## 1. Descuadre móvil de la ficha de saga (bug)

La cabecera de la pestaña Info (`saga-info.tsx`) pone en una fila sin wrap el
título de sección y hasta TRES botones de curación («Editar ficha», «Anidar en
universo», «Configurar orden de lectura»). A 390px no caben → overflow
horizontal que descuadra la página entera (captura del usuario).

**Fix**: los botones pasan a un contenedor propio con `flex-wrap` (la cabecera
apila en móvil); comprobar a 390px que la ficha entera queda sin scroll
horizontal. Sin cambios de contenido ni de gates.

## 2. Des-anidar subsagas desde el panel del editor

Hoy sacar una subsaga de un universo exige ir a `/saga/[subsaga]/editar` →
«Quitar del universo». En el panel izquierdo del editor del grafo (donde ya se
listan las subsagas con su color) se añade una acción por subsaga: **«Sacar del
universo»**, con confirmación inline que avisa de las consecuencias:

- Ejecuta `setParentSaga(childId, null)` (action existente, gate collaborator+).
- Sus títulos dejan de contar en el universo (las membresías de la subsaga no
  se tocan — siguen siendo suyas).
- Si el borrador del grafo tiene un nodo de esa subsaga, se quita del borrador
  (nodo + aristas) en el mismo gesto — evita el nodo huérfano cuya expansión
  quedaría vacía (DEFER 4 de la fase 5).
- La lista local de subsagas se actualiza sin recargar.

## 3. Borrar una saga (zona de peligro)

Al final de `/saga/[id]/editar` (superficie ya gated collaborator+), una
**zona de peligro** con «Borrar saga»:

- Confirmación en dos pasos (botón → confirmar con el texto de consecuencias).
- Server action nueva `deleteSaga(sagaId)`: gate collaborator+, verifica
  existencia, `DELETE` de la fila. La BD ya hace el resto: membresías, nodos,
  aristas y follows en cascada; **las subsagas NO se borran** — quedan como
  sagas raíz (`parent_saga_id on delete set null`). Los ítems de catálogo no
  se tocan.
- Vale para sagas manuales Y TMDB (decisión del usuario; una TMDB borrada
  puede reaparecer por cache-as-you-go — aceptado).
- Tras borrar: redirect a `/sagas` y revalidación.
- Beneficio lateral: el e2e de curación puede limpiar sus propios residuos
  `[QA Curación]` vía UI (cierra el DEFER 9 del PR #90).

## 4. Conexiones laterales en el grafo (aristas flotantes)

Hoy cada nodo tiene un único punto de salida (abajo) y entrada (arriba): todo
conecta en vertical y no se puede «sacar un nodo desde el lateral».

**Diseño (opción «4 lados + ruta automática»)**:

- Cada nodo del EDITOR gana puntos de conexión en los 4 lados para iniciar el
  arrastre desde donde convenga (React Flow `ConnectionMode.Loose`).
- Las aristas pasan a ser **flotantes**: se dibujan automáticamente entre los
  lados más cercanos de ambos nodos (patrón floating-edges de React Flow:
  intersección de la línea entre centros con el rect de cada nodo). El lado
  elegido NO se persiste — `saga_edges` no cambia, sin migración.
- El VIEWER (`saga-graph-view`) usa el mismo componente de arista flotante
  para que mapa y editor se vean igual. Los estilos por `edge_type`
  (principal/opcional/requisito) se conservan tal cual.

## Fuera de alcance

- Persistir el lado de conexión (columnas source/target handle).
- Borrado en cascada de subsagas al borrar un universo.
- El resto de DEFERs de los PRs #90/#92 no listados aquí.
