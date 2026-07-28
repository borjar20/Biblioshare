# Rediseño de la gestión de itinerarios — diseño

> [Canónico · verificado 2026-07-29] Spec de la pantalla `/saga/[id]/rutas`.
> El editor de PASOS (`/rutas/[slug]/editar`) **no** entra aquí: es la segunda
> spec de este mockup. Fuente gráfica:
> `D:\Proyectos\Personal\Mockups\Paper - Itinerarios (rediseño) (1).html`,
> frames M1, M2, M3, M4 y D1.

## 1 · Qué se rediseña y por qué

`/saga/[id]/rutas` es hoy una columna centrada con tres piezas apiladas:

- `RouteList`, una fila por itinerario con nombre, resumen, y cuatro controles
  sueltos en línea (↑ ↓, «Editar pasos», «Renombrar», «Borrar»).
- `ReadingOrderPicker`, un bloque de radios que **repite la lista entera** para
  preguntar cuál es el orden de lectura, con su propio botón de guardar.
- `CreateRouteForm`, un formulario abierto de forma permanente al pie.

Tres problemas concretos, no de gusto:

1. **La lista se pinta dos veces.** Un itinerario aparece como fila y otra vez
   como radio. Son la misma cosa preguntada de dos maneras, y la segunda
   obliga a leer la lista completa para responder algo que es una propiedad de
   una fila.
2. **Cuatro acciones al mismo nivel visual.** «Editar pasos» —lo que se hace
   casi siempre— pesa lo mismo que «Borrar».
3. **La pantalla es un callejón sin salida:** no hay forma de volver a la ficha.

El rediseño la trae al lenguaje del resto de la app (tarjeta sobre papel,
Fraunces para nombres, monoespaciada para metadatos, una acción primaria por
pantalla) y arregla los tres.

## 2 · Alcance

**Dentro:**

- M1 · Lista con la elección de orden de lectura *en la fila*.
- M2 · Menú ⋯ de fila (renombrar, editar pasos, usar como orden, borrar) con
  la confirmación de borrado dentro.
- M3 · Estado vacío con el formulario de crear abierto.
- M4 · Renombrar, con el error de nombre repetido marcado en el campo.
- D1 · Escritorio a dos columnas: lista + raíl.
- Contadores por fila: **pasos y notas**.
- Fila sintética «Mapa generado».
- Modo oscuro (sale solo: son tokens, no estructura).

**Fuera, cada uno con su issue:**

| Qué | Por qué queda fuera |
|---|---|
| Duplicar itinerario | Acción de servidor nueva (copiar ruta + todos sus pasos con notas + slug libre). No existe hoy y no es rediseño. |
| Contador de lectores («41 lectores») | La RLS de `saga_route_choices` es solo-dueño (`user_id = auth.uid()`), así que contar desde la página devuelve 0 o 1, nunca 41. Sacarlo exige migración: una función `security definer` que devuelva solo slug + recuento. |
| Panel «Qué ve el lector» | Explicativo, sin datos nuevos, pero es superficie extra que revisar. |
| Editor de pasos (M5-M7, D2) | Segunda spec. |

## 3 · Arquitectura

Carpeta nueva `src/components/saga/routes/`, con la pantalla partida en dos
cáscaras — el mismo patrón que el editor de secuencia
(`src/components/saga/sequence/shell-mobile.tsx` y `shell-desktop.tsx`), que ya
resolvió este problema para la pantalla hermana.

| Fichero | Responsabilidad | Cliente/servidor |
|---|---|---|
| `routes-manager.tsx` | Único dueño del estado de pantalla: qué fila tiene hoja abierta, qué fila se renombra, qué transición está en vuelo. Monta las dos cáscaras. | cliente |
| `shell-mobile.tsx` | Cabecera, lista, «+ Nuevo itinerario», hoja de crear. | cliente |
| `shell-desktop.tsx` | Cabecera ancha y dos columnas: lista y raíl con el panel de crear/renombrar. | cliente |
| `route-row.tsx` | La fila. **Una sola**, la usan las dos cáscaras. | cliente |
| `route-form.tsx` | Nombre + resumen, con contadores de caracteres y error de nombre repetido. Lo comparten crear y renombrar. | cliente |
| `route-sheet.tsx` | Hoja de fila: menú + zona de peligro del borrado. `<dialog>` nativo. | cliente |
| `count-route-entries.ts` (en `src/lib/sagas/`) | Función pura: filas de `saga_route_entries` → recuento de pasos y notas por ruta. | puro |

**Se borran:** `src/components/saga/route-list.tsx`,
`src/components/saga/create-route-form.tsx`,
`src/components/saga/reading-order-picker.tsx`.

`src/app/saga/[id]/rutas/page.tsx` sigue siendo servidor: gate de rol,
consultas, y pasa datos ya resueltos.

**Por qué dos cáscaras y no un árbol responsive:** el mockup no mueve los
mismos controles de sitio, cambia su forma. En móvil las acciones de la fila
viven en el pie y en una hoja modal; en escritorio van en línea y el menú es un
popover. Un solo marcado con breakpoints acaba siendo condicionales dentro del
JSX. Coste asumido y ya conocido en el repo: **los dos árboles se montan a la
vez** y se ocultan por breakpoint, así que todo locator de e2e necesita
`:visible` (la «regla de los dos árboles», documentada en
`e2e/sagas-orden-designado.spec.ts:107-112`).

**Se reutiliza, no se reinventa:**

- `src/components/ui/action-menu.tsx` para el ⋯ de escritorio: ya trae
  `aria-haspopup`, cierre con Escape y con clic fuera.
- El `<dialog>` nativo con `showModal()` de `sequence/row-sheet.tsx` para las
  hojas de móvil: da gratis Escape, trampa de foco e `inert` del fondo.
- La zona de peligro de `saga-meta-editor.tsx` para el borrado.

## 4 · Datos

`page.tsx` hace dos cambios, **ninguno de esquema**:

1. Añade `show_map` a la consulta de `sagas` que ya hace por el nombre.
2. Una consulta agregada más, **no una por fila**:

```ts
const { data } = await supabase
  .from("saga_route_entries")
  .select("route_id, note")
  .in("route_id", routes.map((r) => r.id));
```

y el recuento se hace en memoria:

```ts
export type RouteCounts = { steps: number; notes: number };
export function countRouteEntries(
  rows: Array<{ route_id: string; note: string | null }>,
): Record<string, RouteCounts>;
```

Función pura y testeada aparte. Con cero itinerarios la consulta ni se lanza
(`routes.length === 0` corta antes: `.in()` con lista vacía es una ida y vuelta
a BD para no traer nada).

Una nota vacía o toda de espacios **no cuenta como nota**: `note.trim() !== ""`.
La BD permite `''` aunque el editor de hoy guarde `null` en ese caso, y un
contador que dijera «3 notas» con tres cadenas vacías mentiría.

**Cero migraciones en esta fase.**

## 5 · La fila

Anatomía, de arriba abajo:

- **Flechas ↑ ↓** solo en las filas movibles. La designada no las lleva: está
  fijada arriba por su designación, no por su `position`, así que sus flechas
  moverían un número sin efecto visible. Es la regla que ya aplica
  `route-list.tsx:26-29` y no cambia.
- **Nombre** en Fraunces, con la chapa `Orden de lectura` si lo es.
- **Resumen** («para quién es») debajo, en gris.
- **Metadatos** en monoespaciada: `8 pasos · 3 notas`. Sin pasos dice
  `Sin pasos`, que es información de verdad: un itinerario sin pasos no se le
  ofrece a ningún lector.
- **Pie:** «Usar como orden de lectura» y «Editar pasos» (primaria).

### La elección se aplica al pulsar

No hay botón de guardar en esta pantalla. Pulsar «Usar como orden de lectura»
llama a `setReadingOrder(sagaId, routeId)` dentro de una transición y refresca.
Mientras está en vuelo, la fila se deshabilita.

`setReadingOrder` ya existe y ya es la acción que usaba el bloque de radios: no
cambia el servidor, cambia quién la dispara.

### La fila «Mapa generado»

Es el antiguo radio «Ninguno» con cara de fila: primera, atenuada, sin flechas
y sin «Editar pasos», con un solo control que llama a
`setReadingOrder(sagaId, null)`.

**Se pinta siempre, también con `show_map = false`.** Es deliberado: si se
ocultara, una saga sin mapa que ya tuviera un itinerario designado se quedaría
sin ninguna forma de dejar de designarlo. Lo que sí cambia con `show_map` es el
texto: con mapa dice que el orden lo deduce la app del grafo; sin mapa avisa de
que el lector caerá en el orden de publicación, que es lo que hace hoy
`buildRouteList` cuando `hasGraph` es falso
(`src/lib/sagas/get-saga-routes.ts:73-81`).

## 6 · Crear, renombrar, borrar

`route-form.tsx` es el mismo formulario en los tres sitios donde aparece:
nombre (obligatorio, 80) y resumen (opcional, 280), cada uno con su contador
`n/máx`, y el error del servidor pintado **en el campo que lo causa** — el
nombre repetido (`slugTaken`) marca el borde del nombre y pone el mensaje justo
debajo, en vez del párrafo rojo suelto al pie que hay hoy.

| Gesto | Móvil | Escritorio |
|---|---|---|
| Crear | Hoja desde «+ Nuevo itinerario». Con la lista vacía, el formulario se pinta abierto en la página: es lo único que se puede hacer. | Panel del raíl, siempre abierto. |
| Renombrar | Hoja precargada, desde ⋯. | La misma hoja, que en `lg` se pinta como modal centrado. |
| Borrar | Zona de peligro **dentro** de la hoja de la fila, con el nombre y las consecuencias. | Igual: el ⋯ abre la misma hoja. |

El renombrado usa hoja también en escritorio, y no un segundo modo del panel
del raíl: el mockup no dibuja el renombrado en escritorio (D1 solo tiene
«Nuevo itinerario» en el raíl), y un raíl con dos modos añade una máquina de
estados —y el riesgo de perder lo que se estuviera escribiendo en «crear» al
pulsar «renombrar»— a cambio de nada visible.

El aviso de que **el slug no cambia al renombrar** va bajo el campo de nombre,
en texto pequeño, no como banda de advertencia aparte: es cierto y hay que
decirlo, pero no es un peligro. (`renameRoute` no toca el slug — decisión ya
documentada en `route-actions.ts`.)

## 7 · Cabecera, y por qué no hay barra de guardado

La cabecera lleva ‹ (volver), el nombre de la saga con «Itinerarios · curación»
debajo, y «Ver ficha». Eso arregla el callejón sin salida.

**Desvío consciente del mockup:** M1 dibuja una barra fija al pie que dice
«Todo aplicado». No se implementa. En esta pantalla no hay borrador ni nada
pendiente de guardar —todo se aplica al pulsar—, así que serían ~60 px fijos
permanentes para no informar de nada, robados al contenido en un móvil de
400 px. El «Volver a la ficha» que la barra justificaba vive en la cabecera.

## 8 · Estados

| Estado | Qué se ve |
|---|---|
| Cero itinerarios | Hueco explicando qué es un itinerario + formulario de crear abierto. Sin lista, sin fila de mapa generado (no hay nada que designar). |
| Ninguno designado | La fila «Mapa generado» lleva la chapa y el resto ofrecen «Usar como orden de lectura». |
| Acción en vuelo | La fila afectada se deshabilita. No hay spinner global: cada fila responde por lo suyo. |
| Nombre repetido | Borde rojo en el campo + mensaje debajo. La hoja/panel **no** se cierra. |
| Fallo de borrado | Mensaje dentro de la zona de peligro, que sigue abierta. |

## 9 · Tests

**Unitarios (vitest):** `count-route-entries.test.ts` — cero filas, varias
rutas mezcladas, notas nulas, notas vacías y de solo espacios (no cuentan),
rutas sin ninguna entrada (ausentes del mapa, no cero).

**E2E:** `e2e/sagas-orden-designado.spec.ts` hay que **reescribirlo**. Hoy marca
un `radio` y pulsa «Guardar elección»; los dos controles dejan de existir. Pasa
a pulsar «Usar como orden de lectura» en la fila y esperar la chapa
`Orden de lectura`, que es la misma señal de servidor que ya usaba para
sincronizar — la protección no baja, cambia el gesto. Con los dos árboles
montados, todos sus locators necesitan `:visible`.

`e2e/sagas-itinerarios.spec.ts` **no se toca**: de esta pantalla solo comprueba
el encabezado «Itinerarios de lectura», que se conserva literal.

## 10 · Riesgos

1. **Los dos árboles.** Es la trampa que más veces ha mordido en este repo: sin
   `:visible`, cada locator encuentra el doble de elementos y el test falla por
   ambigüedad, no por el fallo que buscaba.
2. **Aplicar al pulsar no tiene deshacer.** Designar y desdesignar cambia lo que
   ven todos los lectores de la saga, de inmediato. Se asume: es reversible con
   otro clic y la acción ya se comportaba así al pulsar «Guardar elección».
3. **`setReadingOrder` y el unique parcial.** Solo puede haber un designado por
   saga (`saga_routes_reading_order_key`). Con dos pestañas abiertas, la
   segunda pulsación gana; el `router.refresh()` deja ver siempre el estado
   real de BD.
4. **Los contadores son de servidor.** Tras editar pasos en la otra pantalla, el
   número solo se actualiza cuando esta se revalida. `revalidateSagaPage` no
   cubre `/rutas` (ya consta en `sagas-orden-designado.spec.ts:146-149`), así
   que se llega con navegación, no con recarga.
