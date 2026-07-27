# Sagas fase 4: el orden que manda, y la ventana de una obra anidada — diseño

> **[Canónico · verificado contra el repo y contra prod el 2026-07-27]**
> Continúa la fase 3 (`2026-07-27-sagas-fase-3-retirada-del-grafo-design.md`, PR #209, desplegada, con
> `saga_nodes`/`saga_edges`/`save_saga_graph` ya borradas de producción). El estado de la feature vive
> en `docs/requirements/backlog.md`; lo accionable, en issues. Los números marcados **[MEDIDO]** salen
> de `SELECT` de solo lectura contra **producción** el 2026-07-27.

## Las dos cosas que se construyen

Salen de usar el producto, no de una lista de deseos. En palabras del responsable:

- **(A)** «al marcar el orden recomendado, **que debería unificarse con orden de lectura**» — hoy el
  selector ofrece dos chips que prometen lo mismo.
- **(B)** «en el editor de las secuencias me gustaría **poder ir a nivel de item de las subsagas**;
  ejemplo, dentro de las Novelas secretas me gustaría poner a *El Hombre Iluminado* en una ventana
  dentro del Cosmere».

Son independientes entre sí y podrían construirse por separado. Van juntas porque las dos salen de la
misma sesión de curación real y tocan la misma pantalla.

## Lo que hay hoy, medido

**El escenario es minúsculo, y eso gobierna el diseño.** **[MEDIDO]**

| | |
|---|---|
| sagas | 85, con 12 hijas y profundidad máxima **1** |
| sagas con mapa (`show_map`) | **4** |
| itinerarios | **3**, en 2 sagas: Cosmere `orden-recomendado` (19 pasos), Mundodisco `rincewind` (8) y `orden-recomendado` (26) |
| pasos con nota | **0** |
| pasos que son un bloque | **0** |
| ventanas | **2** |
| adopciones de ruta (`saga_route_choices`) | **0** |
| obras con doble membresía | **0** de 363 |

Con estas cifras, **la convivencia que molesta afecta a dos fichas**, y cualquier diseño que exija
migrar datos o mantener invariantes caros está sobredimensionado.

### Tres hechos que deciden (A)

1. **Los dos órdenes no son la misma información: el curado es estrictamente más expresivo.** El
   itinerario del Cosmere **intercala obras `libre` dentro de la cadena de otro bloque**: paso 9
   *Esquirla del Amanecer* (`libre` dentro de El Archivo), paso 15 *El Hombre Iluminado* (de Novelas
   secretas) justo antes de *Viento y Verdad*, que es el hueco 5 de El Archivo. **`deriveSagaMap` no
   sabe producir eso**: a una entrada `libre` le pone `orderNo = null` y el orden final la manda al
   final del mapa. Borrar la ruta curada **pierde dato**; derivarla es **imposible** con el modelo de
   hoy.
2. **Pero un itinerario no sabe decir «esto existe y no tiene puesto».** El subárbol del Cosmere tiene
   **20 miembros y la ruta 19 pasos**: el que falta es *Arcanum Ilimitado*. `validateRouteDraft` **no
   valida cobertura a propósito** —una ruta parcial es un caso de uso legítimo— y `createRoute` crea
   rutas con **cero** pasos.
3. **La ruta sintética `lectura` sí pinta lo que no tiene puesto**, con un «·» en vez de número
   (`saga-map-tab.tsx`, decisión de la #167).

### Dos hechos que deciden (B)

1. **El sujeto-dentro-de-un-bloque YA funciona en producción.** La ventana de *Esquirla del Amanecer*
   está guardada bajo `saga_id` = El Archivo de las Tormentas, y **la ficha y el mapa del Cosmere la
   consumen**, porque `getSagaDetail` carga las ventanas del subárbol entero. Lo que bloquea el caso
   literal son dos cosas mucho más pequeñas de lo que parecía:
   - `getAnchorOptions` **solo baja** en el árbol, así que desde el editor de «Novelas secretas» no
     hay a qué anclar: *Juramentada* vive en otra rama;
   - desde el editor del Cosmere, la obra **no es fila suya**, y `windowNotFree` exige que el sujeto
     esté entre las entradas `libre` **del propio payload**.
2. **La coherencia de las ventanas se sostiene sobre unas pocas líneas de TypeScript, no sobre la
   base de datos.** No hay FK sobre `item_id` ni triggers; el RPC inserta a ciegas y hace
   `delete from saga_placement_windows where saga_id = p_saga_id`.

---

## (A) El orden que manda

**Decisión del responsable: el curador designa cuál ocupa el puesto.** No es automático.

### Cómo funciona

`saga_routes` gana una columna `is_reading_order boolean not null default false`, con un **índice
único parcial** `(saga_id) where is_reading_order` que impide designar dos en la misma saga.

- Si una saga tiene un itinerario designado, **la ruta sintética `lectura` no se ofrece**: su puesto
  y su etiqueta los ocupa el designado. El Cosmere pasa de 3 chips a 2; Mundodisco, de 4 a 3.
- Si no lo tiene, todo sigue exactamente como hoy.
- La regla se concentra en `buildRouteList`, que ya recibe todo lo que necesita.
- Se designa desde `/saga/[id]/rutas`, con un grupo de radios (uno por itinerario, más «ninguno»).

### Lo que el itinerario designado no nombra

**Decisión del responsable: se lista al final, aparte.** El itinerario manda sobre lo que dice, y
debajo la ficha enumera lo que no nombra, **sin número** — exactamente como el mapa pinta hoy con «·»
lo que no tiene hueco. Nadie desaparece de su propia saga, y no obliga a completar itinerarios a mano
cada vez que se añade un título.

No lleva contador («19 de 20») a propósito: sería una **tercera** regla de recuento en la ficha. El
hero ya cuenta con `countedKeys`, que excluye lo `optional` y da **10** en el Cosmere, no 20. Enseñar
la lista es honesto; enseñar un número que no cuadra con el de arriba, no.

### Tres guardas, y por qué

- **No se renombran las filas en la base de datos.** La etiqueta «Orden de lectura» la pone el chip.
  `messages/es.json` ya tiene ese literal y `saga_routes.name` no tiene unique: si se renombrara la
  fila, en cuanto alguien la desdesignara aparecerían **dos chips con el mismo texto**.
- **No se puede designar un itinerario con cero pasos**, ni ceder el puesto a uno que resuelva a cero.
  El flujo normal es crear la fila y editar los pasos después, así que ese estado existe de verdad.
- **`/saga/[id]/rutas` lista el designado primero.** Si no, se rompe el invariante que ya está
  escrito en `get-saga-routes.ts`: el orden que reordena el curador y el que ve el lector coinciden
  siempre.

### Lo que (A) no arregla, dicho en voz alta

En escritorio, el panel del mapa seguirá dibujando la **colocación** con las insignias del itinerario
encima, y en el Cosmere irán en zigzag: …10 → 11-14 en un bloque flotante sin aristas → 15 → 16
volviendo a la fila de El Archivo. Hoy eso solo se ve si el lector elige la ruta curada; **con (A)
pasa a ser la vista por defecto** de esa saga. Es consecuencia directa del hecho 1: el itinerario dice
cosas que el mapa no sabe dibujar. Se acepta a sabiendas, y se mira al desplegar.

---

## (B) La ventana de una obra anidada

**Decisión del responsable: un cajón bajo la fila del bloque, en el editor del padre.** Es lo que
pidió literalmente: sin salir del editor del Cosmere, se despliega «Novelas secretas» y se le da
ventana a una de sus obras.

Esa elección **hace innecesario ampliar las anclas**: curando desde el Cosmere, el subárbol que
`getAnchorOptions` ya recorre incluye *Juramentada*. El caso que motiva la fase se resuelve sin tocar
esa función.

### La pregunta cara: ¿bajo qué saga vive la fila?

Es la decisión de diseño de esta fase, y la fuerza el responsable al pedir **una sola ventana por
obra**: si la misma obra pudiera tener una fila curada desde su subsaga y otra desde el Cosmere,
habría dos, y hoy los dos lectores se quedan con **la más antigua, en silencio**.

**La ventana pertenece a la obra, no al contexto desde el que se cura.** Su fila vive bajo la saga
**dueña** de la membresía —`ownerSagaId`, que `DetailMember` ya expone—, se cure desde donde se cure.
Así «una obra, una ventana» deja de ser una promesa del editor y pasa a imponerlo el unique parcial
que ya existe, `(saga_id, item_type, item_id)`.

En el editor: si la obra ya tiene ventana curada en otro sitio, **el cajón la enseña y deja editarla
ahí mismo**, en vez de crear una segunda.

### La consecuencia, y es la parte cara

Hoy el RPC hace **reemplazo total por saga**, y su comentario lo justifica diciendo que «no hay un
segundo escritor». **Eso deja de ser cierto en el momento en que el editor del padre escribe la
ventana de una obra de su hija**: pasa a haber dos pantallas que escriben la misma fila. Es
exactamente la situación que en la fase 2a obligó a que la baja de `saga_items` fuera **explícita** en
vez de por omisión.

Así que el RPC cambia igual que cambió aquello: **deja de borrar por saga y pasa a borrar por lista
explícita de sujetos**. El editor manda las ventanas que conoce y, aparte, los sujetos de los que se
hace responsable; el RPC borra exactamente esos y reinserta.

Sin ese cambio, guardar desde el Cosmere **borraría en silencio** la ventana que su hija tenía
curada, o la del Cosmere desaparecería al guardar la hija. No es hipotético: en producción hay una
ventana curada desde una hija (*Esquirla del Amanecer*, bajo El Archivo) y otra desde el padre
(*Nacidos Era 2*, bajo Cosmere).

### Lo que NO cambia

- **La restricción dura de la 2b sigue intacta**: una ventana por entrada y **dos anclas** como
  máximo. Esta fase amplía **quién puede ser sujeto**, no cuántas aristas caben. Si al construirla
  apetece una tercera ancla, es la señal que la 2b pidió no ignorar: se para y se dice en voz alta.
- **No se reabre la #187.** Lo único cuyo significado depende del padre es la ventana; la colocación,
  no. El bloque sigue siendo una fila opaca con su enlace «Abrir su editor»: desde el padre **no** se
  mueve, ni se renumera, ni se marca opcional una obra de la hija.
- **El progreso no se toca**, ni por (A) ni por (B).

### Un aviso de producto, antes de construir

En la ficha del Cosmere, **«Novelas secretas» hoy no aparece como bloque**: sus 4 obras son `libre`,
así que el grupo se omite y salen sueltas en la rejilla de «Cuando quieras», sin acento ni nombre de
grupo. La línea «a partir de …» aterrizará en una celda que **no dice que sea una novela secreta**.

Se acepta para esta fase —es lo que ya pasa hoy con *Esquirla del Amanecer*— y **no** se arregla aquí:
cambiar esa regla afecta a todas las fichas y es vecino de la #202, que sigue abierta. Queda anotado
para que, si molesta al verlo, se aborde por su cuenta y no como daño colateral.

## Riesgos conocidos

- **Un guardado desde el padre que no reemita una ventana de la hija la borra.** Es la razón de que
  el borrado pase a ser explícito; hay que probarlo con el caso real, no en abstracto.
- **Una obra con doble membresía** haría ambiguo quién es su dueña. En producción hay **0** casos
  **[MEDIDO]**, y `is_primary` ya existe para desempatar: el diseño lo usa como criterio, y se prueba
  aunque hoy no haya datos.
- **Designar un itinerario cambia la vista por defecto de esa saga.** Con 0 adopciones en
  `saga_route_choices` no hay preferencia de nadie que romper, pero el enlace `?ruta=lectura` que
  alguien tenga guardado degradará por la cadena de precedencia que ya existe.
- **El zigzag del mapa** bajo un itinerario designado (ver «Lo que (A) no arregla»).

## Pruebas

- **Puras y con inyección de fallo**, como toda esta familia: la regla de `buildRouteList` con y sin
  designado, el reparto de «lo que el itinerario no nombra», la resolución del dueño de una ventana
  y el borrado explícito de sujetos.
- **El caso que más protege**: curar una ventana desde el padre y otra desde la hija, guardar las dos
  pantallas en cualquier orden, y comprobar **contra la base de datos** que ninguna se lleva a la otra
  por delante. Es lo que ningún CHECK puede garantizar.
- **E2E**: designar un itinerario y ver que sustituye a «Orden de lectura», desdesignarlo y ver que
  vuelve; y dar ventana a *El Hombre Iluminado* desde el editor del Cosmere.
- **Contra producción, antes y después**: las 2 ventanas siguen siendo 2 y dicen lo mismo; el progreso
  del Cosmere no se mueve.

## Fuera de alcance

- **Materializar `lectura` como fila de `saga_routes`.** Congelaría lo derivado —la familia de la #91,
  que el CHECK de slugs reservados existe para impedir— y chocaría con el `max(position)+1` de
  `insertRouteRow` y con la renumeración de `computeMovedPositions`. Un booleano compra lo mismo.
- **Enganchar el `orderNo` del mapa a `createCuratedOrder`.** `createCuratedOrder` da posición a todo,
  así que `orderNo === null` dejaría de existir — y ese `null` es lo que enciende las ramas del
  timeline de móvil, la etiqueta «orden nº» y el «·» de la #167. Es decir: mataría la única
  representación en móvil de una ventana.
- **Atar la ventana a su entrada con FKs compuestas y triggers.** Es lo correcto a largo plazo, pero
  hoy rompería desanidar una subsaga que tenga ventana —y hay una viva, la de *Nacidos Era 2*—, con
  2 ventanas en toda la base. Se reevalúa cuando haya datos que lo justifiquen.
- **Mover, renumerar o marcar opcional desde el editor del padre** (#187).
- **Que «Novelas secretas» vuelva a pintarse como bloque** teniendo todas sus obras `libre`.
