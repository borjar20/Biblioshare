# Checklist manual — Modificar actividad, opiniones por ítem y picker con catálogo

Cambios en las vistas de actividad de club: la curación del pool (y, en lecturas
conjuntas, la gestión de hitos) se separa a una vista "Modificar actividad", la
lista de ítems con sus opiniones baja al final de la página, y el picker de ítems
busca también en el catálogo general (no solo en tu biblioteca).
Revisar en móvil y escritorio, claro y oscuro.

## Vista "Modificar actividad"

- [ ] En el detalle de una actividad con pool, la cabecera "ÍTEMS" muestra "MODIFICAR ACTIVIDAD" a la derecha **solo** para quien puede editar: curadores (list_challenge/tierlist → creador; buddy_read → cualquier participante) **o cualquier moderador/owner del club, aunque no participe**.
- [ ] Pulsar abre la vista de edición en la misma página: "← Volver a la actividad", título "Modificar actividad" y el gestor de ítems (añadir/quitar) que antes vivía en el detalle.
- [ ] Quitar un ítem funciona y respeta las reglas de siempre (solo quien lo añadió, mod+, o el creador en kinds de curadores).
- [ ] "Volver a la actividad" regresa al detalle con la lista refrescada.
- [ ] Un miembro raso sin permiso de curar no ve el botón; en un reto de lista sigue viendo la nota "solo quien propuso el reto…" dentro de la vista de edición (si entra como curador).
- [ ] buddy_read con su ítem ya puesto (máx. 1): en edición no aparece "Añadir ítem".

## Gestión de hitos (solo lectura conjunta)

- [ ] En el detalle de una buddy_read ya **no** aparece el formulario de alta/edición de hitos: el tablero solo los lista.
- [ ] Dentro de "Modificar actividad", bajo el gestor de ítems, aparece la sección "HITOS" con el gestor de siempre — **solo para moderador/owner**; un participante raso que entra a editar no la ve.
- [ ] Sin ítem en el pool todavía, la sección de hitos no se pinta (no hay posiciones que medir).
- [ ] Actividad no activa (propuesta/terminada/archivada): el gestor de hitos aparece deshabilitado, como antes.
- [ ] Crear, editar, reordenar y borrar un hito desde el panel y volver a la actividad → la lista de hitos del detalle refleja el cambio.

## Orden de la página

- [ ] La lista de ítems (con las opiniones) es lo **último** de la página: va después del tablero del kind (hitos / tierlist / rejilla del reto de lista).
- [ ] En criteria_challenge (sin pool) no hay lista de ítems ni botón de modificar.

## Opiniones dentro de cada ítem

- [ ] En el detalle, cada ítem es una fila (portada + título serif) que enlaza a su ficha.
- [ ] Participantes ven a la derecha "OPINAR" (o "N OPINIONES" si ya hay) con chevron; al expandir aparecen las opiniones ajenas (avatar + nota/10 + comentario) y tu formulario (valoración 1-10 + comentario + guardar).
- [ ] Guardar opinión actualiza el contador y conserva tu valoración al reabrir.
- [ ] Ya NO existe la sección "Opiniones" separada de abajo.
- [ ] No participante: filas sin botón de opinar + nota "Únete a la actividad…" bajo la lista.
- [ ] Actividad con pool vacío: texto "Todavía no hay ítems en esta actividad." y el curador puede entrar a Modificar para añadir los primeros.

## Picker con catálogo general

- [ ] En "Añadir ítem" (edición) y en el asistente de Proponer actividad el picker muestra dos chips de fuente: "Tu biblioteca" (por defecto) y "Catálogo".
- [ ] Biblioteca: comportamiento de siempre (búsqueda con debounce sobre tu colección).
- [ ] Catálogo: con menos de 2 letras muestra el hint; con 2+ busca (DB local primero, API externa después) y muestra título + autor/año.
- [ ] En catálogo siempre hay chips de tipo (Libro/Película/Serie, o los que permita el kind); cambiar de tipo re-busca.
- [ ] Elegir un resultado del catálogo que NO está en tu biblioteca lo añade al pool correctamente (se cachea con uuid local; la fila enlaza a su ficha y la portada se ve).
- [ ] El ítem elegido del catálogo NO aparece en tu biblioteca por elegirlo en el wizard (solo se añadirá como pendiente al activarse/unirte, por los triggers de siempre).
- [ ] Repetir la misma búsqueda de catálogo es instantánea (segunda vez es hit local).
- [ ] En el wizard de proponer, los ítems elegidos de catálogo se pintan igual (miniatura + quitar con ✕) y la propuesta se crea bien.

## Transversal

- [ ] `?` Recargar el detalle: sin errores de hidratación en consola.
- [ ] Dark mode: chips de fuente/tipo, filas de ítem y formulario legibles.
