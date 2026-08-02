---
[Canónico · verificado 2026-08-01]
---

# Feed: ocultar «Añadir» en obras que ya están en la biblioteca

## Problema

Las tarjetas de tipo Colección del feed pintan hoy `QuickAddButton` en todas sus
filas. El botón aparece incluso cuando el visitante ya tiene un pase activo para
esa obra. En tarjetas agrupadas, el pie «Guardar los N en mi cola» también cuenta
y envía todas las obras, incluidas las que ya están en su biblioteca.

La acción del servidor es idempotente, pero la interfaz ofrece una acción que no
produce ningún cambio y comunica un recuento incorrecto.

## Comportamiento acordado

- «Ya está en mi biblioteca» significa que existe un pase con `is_active = true`
  para la pareja `(item_type, item_id)` del usuario que mira el feed.
- Una fila cuyo ítem ya está en la biblioteca no muestra `QuickAddButton` ni un
  sustituto visual.
- El botón agrupado solo cuenta y envía los ítems que faltan.
- Si no falta ningún ítem, el botón agrupado no se renderiza.
- Tras un alta rápida correcta se conserva el comportamiento optimista actual de
  `QuickAddButton` para la fila que sí podía añadirse.

## Enfoque elegido

`getFeed` resolverá la pertenencia a la biblioteca en el servidor y por lote.
Cuando ya haya reunido las claves de catálogo de la página, consultará los pases
activos del visitante limitados a esos `item_id`. Con el resultado construirá un
set de claves `item_type:item_id` y marcará los eventos `added` que pertenezcan a
ese set.

`CollectionCard` derivará una lista de ítems pendientes a partir de esa marca:

- por fila, solo renderiza `QuickAddButton` si el ítem está pendiente;
- en el pie, usa la lista pendiente tanto para el recuento como para
  `quickAddManyToLibrary`;
- el pie existe solo cuando quedan al menos dos ítems pendientes, manteniendo la
  regla visual actual de no ofrecer una acción grupal para una sola obra.

La consulta se hará una vez por página del feed, por lo que funciona igual para la
primera carga y para «Cargar más».

## Alternativas descartadas

1. **Consultar desde cada botón.** Introduce una petición por fila, estados de carga
   independientes y parpadeo al hidratar.
2. **Cargar toda la biblioteca por separado en la página.** Duplica el transporte
   hacia `FeedList`, complica la paginación y lee obras que no aparecen en la
   página actual.
3. **Confiar solo en la idempotencia de la acción.** Evita duplicados en datos, pero
   no corrige la acción engañosa ni el recuento del botón agrupado.

## Datos y fronteras

No hay cambios de esquema ni migraciones. `passes` sigue siendo la fuente de verdad
del estado vivo del usuario; `library_entries` no participa.

La marca de pertenencia forma parte de la representación del evento que consume la
UI, no de la entidad social persistida. Solo afecta a la presentación del visitante
actual y no modifica el agrupado, el orden, el cursor, las interacciones ni los
eventos del actor.

## Pruebas

El E2E de la tarjeta Colección sembrará dos obras del mismo evento y un pase activo
del usuario visitante para una de ellas. Debe demostrar que:

- ambas obras siguen visibles en la tarjeta;
- la obra ya poseída no tiene botón «Añadir»;
- la obra pendiente sí tiene exactamente un botón «Añadir»;
- el pie no ofrece «Guardar los 2» cuando solo falta una obra.

Si la regla visual del pie cambia para permitir el guardado grupal de una sola obra,
la prueba deberá verificar además que su recuento y payload son uno; este cambio no
forma parte del alcance actual.

## Riesgos y comprobaciones

- La pertenencia debe comprobar la pareja tipo/id, no solo el UUID del catálogo.
- Solo los pases activos cuentan como estado vivo de biblioteca.
- La consulta debe quedar limitada a las obras de la página actual.
- La ruta de perfil puede servir el feed a visitantes anónimos; no debe atribuirles
  la biblioteca del actor usado como fuente del feed.
- Se verificará la primera página y el contrato compartido por la paginación.

