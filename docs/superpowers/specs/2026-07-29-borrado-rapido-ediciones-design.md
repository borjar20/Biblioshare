# Borrado rápido de ediciones desde la ficha (colaborador+)

[Canónico · verificado 2026-07-29]

## Problema

Borrar una edición del catálogo ya es posible, pero está enterrado: hay que abrir el editor de
ficha (`?editar=ficha`), desplegar la edición con el lápiz y pulsar «Borrar edición». Tres gestos
y un cambio de contexto para una tarea que un colaborador hace en ráfagas — la sincronización con
OpenLibrary deja ediciones duplicadas o basura que hay que limpiar de varias en varias.

El objetivo es sacar ese borrado a la tira de ediciones de la propia ficha, sin entrar al editor.

## Lo que ya existe (no se toca)

- `deleteEdition(editionId, itemType, itemId)` en `src/lib/catalog/edit-actions.ts`. Valida
  UUID y tipo de ítem en runtime (se llama directo desde el cliente, sus argumentos son
  manipulables), exige colaborador+, rechaza `series`, y hace un chequeo amable de pases antes
  de borrar. Devuelve `{ error: "forbidden" | "inUse" | "generic" }` o `{ ok: true }`.
- El trigger `block_edition_delete_if_used` (`20260714_editions_f_delete_guard.sql`) es la
  protección real: ve todos los pases sin filtro de RLS y lanza `edition_in_use`.
- `EditionStrip` (`src/components/detail/edition-strip.tsx`) ya recibe `canContribute` y lo usa
  para pintar el alta inline «+ Añadir edición».

No hace falta backend nuevo ni cambios de esquema.

## Diseño

### 1. El gesto: `×` en la tarjeta

Un botón `×` en la esquina superior derecha de cada tarjeta de `EditionStrip`, visible solo si
`canContribute` y la edición **no** está en uso. Área de pulsación de 28×28 con icono de 12px,
`text-muted-foreground` en reposo y `text-status-dropped` en hover.

No choca con el `✓` de «La tuya», que ocupa esa misma esquina: la edición marcada como tuya es la
del pase abierto de quien mira, así que por definición tiene al menos un pase contra ella y sale
siempre como *en uso* — su `×` no llega a pintarse nunca.

Las tarjetas siguen sin ser pulsables (decisión previa de la tira): el `×` es el único elemento
interactivo que se añade.

### 2. Confirmación

Un `<dialog>` nativo dentro de `EditionStrip`, mismo patrón que `hero-menu.tsx` (`showModal()`
da foco, Escape y cierre por clic fuera sin código propio). Un único dialog reutilizado, con la
edición pendiente en estado.

Contenido: la etiqueta de la edición y el aviso de que el borrado afecta a toda la comunidad.
Botones «Cancelar» y «Borrar».

Al confirmar, `useTransition` llama a `deleteEdition`. Si devuelve error, el mensaje se pinta
**dentro del dialog** y este no se cierra — el error `inUse` es información útil, no un fallo que
haya que esconder. Si va bien, el dialog se cierra y la revalidación de `deleteEdition`
(`revalidateItemPage`) refresca la tira.

El borrado del catálogo compartido es irreversible y afecta a otros usuarios: por eso confirmación
explícita y no un «deshacer». Un deshacer real implicaría recrear la fila con otro id, y hoy no
hay infraestructura de toast/undo en el proyecto.

### 3. Saber qué ediciones están en uso

Nueva función en `src/lib/editions/get-used-edition-ids.ts`:

```ts
getUsedEditionIds(supabase, editionIds: string[]): Promise<string[]>
```

Un `passes.select("edition_id").in("edition_id", ids)` deduplicado. Devuelve `[]` sin ids.

Se ejecuta **solo cuando `canContribute`**: colaborador+ es un grupo pequeño, y así una visita
normal a una ficha no paga una consulta extra.

Como las ediciones llegan por streaming, la página encadena sobre la promesa que ya existe en vez
de esperarla:

```ts
const usedEditionIdsPromise = canContribute
  ? editionsPromise.then((eds) => getUsedEditionIds(supabase, eds.map((e) => e.id)))
  : Promise.resolve([]);
```

`EditionsSection` resuelve las dos promesas con `use()` dentro del mismo `<Suspense>`, así que la
tira no aparece más tarde de lo que ya lo hace.

**Límite asumido:** la RLS de `passes` solo deja ver los pases propios y los de perfiles públicos.
Una edición usada únicamente por perfiles privados no se detecta aquí y sí enseñará el `×`; el
borrado fallará entonces con `inUse` desde el trigger, y ese es exactamente el mensaje que ve el
colaborador. Es la misma limitación que ya tiene el chequeo del editor de ficha. La alternativa
exacta —una RPC `SECURITY DEFINER` que cuente todos los pases— necesita migración en dev y prod;
queda como issue, fuera de este cambio.

### 4. Alcance

Libros y películas. Las series no tienen ediciones (su unidad de progreso son los episodios) y
`deleteEdition` ya devuelve `forbidden` para ellas.

### 5. i18n

Claves nuevas en el namespace `editions` de `messages/es.json`:

| Clave | Uso |
|---|---|
| `delete` | `aria-label` del botón: «Borrar {label}» |
| `confirmTitle` | Título del dialog |
| `confirmBody` | Aviso de que afecta a toda la comunidad |
| `confirmDelete` | Botón de confirmar |
| `cancel` | Botón de cancelar |
| `errors.inUse` | «Hay pases registrados contra esta edición» |
| `errors.deleteFailed` | Fallo genérico al borrar |

`editions.errors.forbidden` y `editions.errors.generic` ya existen, pero su texto habla de
*añadir* ediciones; por eso el borrado trae sus propias claves en vez de reutilizarlas.

## Pruebas

**Unit** (`src/lib/editions/get-used-edition-ids.test.ts`): lista vacía sin ids; deduplicación
cuando varios pases apuntan a la misma edición.

**E2E** (`e2e/borrado-rapido-ediciones.spec.ts`):

1. Un usuario sin rol no ve ningún `×` en la tira.
2. Un colaborador ve el `×` en una edición sin pases.
3. La edición del pase propio no ofrece `×`.
4. Cancelar en el dialog no borra: la tarjeta sigue ahí.
5. Confirmar borra: la tarjeta desaparece y el recuento baja.

## Documentación al cerrar

- Entrada al final de `docs/requirements/decisiones.md`: por qué el `×` vive en la tira y no solo
  en el editor, y el límite de RLS que se asume a sabiendas.
- Issue para la RPC `SECURITY DEFINER` que detecte con exactitud las ediciones en uso.
- `data-model.md` no se toca: no hay cambios de esquema.
