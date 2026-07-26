# Sagas fase 2b: la ventana de una entrada libre — diseño

> **[Canónico · verificado contra el repo y contra prod el 2026-07-26]**
> Continúa `2026-07-26-sagas-fase-2a-editor-secuencia-design.md` (fase 2a, mergeada en la PR #201 y
> desplegada). El estado de la feature vive en `docs/requirements/backlog.md`; lo accionable, en
> issues. Los números marcados **[MEDIDO]** salen de `SELECT` de solo lectura contra producción el
> 2026-07-26, después de desplegar la fase 2a.

## Antes de construir nada: esta fase todavía no tiene datos

La fase 2a dejó la zona «Cuando quieras» funcionando, pero una entrada `libre` es hoy **solo una fila
sin hueco**. No puede decir *entre dónde y dónde* se lee. Esta fase le da esa capacidad.

El problema es que **nadie la ha usado todavía**. Medido en producción justo después del despliegue:

| | filas |
|---|---|
| `fijo` | 342 |
| sin clasificar | 9 |
| **`libre`** | **0** |
| `optional` | 0 |

**[MEDIDO]** Son los mismos números que antes de la fase 2a, porque el editor lleva minutos
desplegado. Construir el editor de ventanas ahora significaría estrenarlo sin una sola fila que
editar — que es exactamente el argumento con el que 2b se separó de 2a.

> ### Puerta de entrada: curar el Cosmere primero
>
> **Antes de escribir una línea de esta fase, hay que curar a mano las sagas que la motivan**, con el
> editor que ya existe. Concretamente el Cosmere: marcar *Nacidos de la Bruma Era 2* y *Novelas
> secretas* como `libre` + `optional`, y ver qué pasa.
>
> Eso cuesta minutos y produce lo único que puede decidir esta fase: **datos reales**. Tres
> resultados posibles, y los tres son buenos:
>
> 1. El curador quiere decir «a partir de Era 1, antes de Viento y Verdad» y no puede → esta fase se
>    construye tal como está descrita aquí.
> 2. Al curar, resulta que con marcar `libre` + `optional` ya se entiende lo suficiente y nadie echa
>    de menos la ventana → **esta fase no se construye**, y se cierra su issue diciendo por qué.
> 3. Lo que hace falta resulta ser otra cosa (una nota libre por entrada, por ejemplo) → esta fase se
>    reescribe antes de empezar.
>
> El caso que la motiva está literalmente en palabras del curador, recogido en el spec de la fase 1:
> ***Nacidos de la Bruma Era 2 es opcional, a partir de Era 1, y recomendable antes de Viento y
> Verdad***. Ese es el enunciado que hay que poder expresar. Si al curar de verdad el enunciado
> cambia, manda el enunciado nuevo.
>
> ### Resultado de cruzarla, el 2026-07-26
>
> **Se curó.** El Cosmere quedó así: la secuencia es *Arcanum Ilimitado* → *Elantris* → *Nacidos Era
> 1* → *El Aliento de los Dioses* → *El Archivo de las Tormentas*, y en «Cuando quieras» quedaron
> **dos bloques `libre` + `optional`**: *Nacidos Era 2* y *Novelas secretas*. El progreso pasó de 20
> obras a **12**, exactamente lo que predijo el spec de la fase 1, y se ve correcto en la ficha
> (75% = 9 de 12).
>
> **La puerta se cruza con el resultado 1**: el curador quiere decir «a partir de Era 1, antes de
> Viento y Verdad» y hoy no puede. La fase se construye.
>
> **Pero cambia dos cosas de este documento**, las dos por el mismo motivo — que las entradas `libre`
> reales resultaron ser **bloques**: la sección «Fuera de alcance» de abajo (corregida) y la
> dependencia de la #198, que pasa de deseable a bloqueante.

## Qué se construye

1. **`saga_placement_windows`**: una tabla con **como máximo una fila por entrada** y **como máximo
   dos anclas**.
2. **El guardado**: `save_saga_sequence` crece para escribir y borrar ventanas en la misma
   transacción que el resto de la secuencia.
3. **La curación**: el control «+ Añadir ventana» dentro de la zona «Cuando quieras», con dos
   selectores de ancla.
4. **El render**: la sección «Cuando quieras» de la ficha pinta la ventana en texto —
   *«a partir de Nacidos Era 1 · recomendable antes de Viento y Verdad»*.

### Fuera de alcance

- ~~**Ventanas cuyo *sujeto* sea un bloque-subsaga.** El esquema las admite, pero la interfaz y el
  render de esta fase solo cubren **obras**, y el motivo es concreto: la issue **#198** dice que la
  colocación curada de un bloque hoy **no la lee nadie** —la ficha sigue ordenando los bloques por el
  `position` mínimo de sus miembros—, así que una ventana sobre un bloque sería curación invisible.
  Se abre cuando #198 esté resuelta.~~

  > **Corrección [2026-07-26, al cruzar la puerta de entrada]: esta decisión estaba del revés y se
  > retira.** Al curar el Cosmere de verdad, las dos entradas que quedaron `libre` son **bloques**
  > —*Nacidos de la Bruma Era 2* y *Novelas secretas*— y `saga_items` sigue **[MEDIDO]** con **cero**
  > filas `libre` en toda la base de datos. El caso que motiva la fase entera, en palabras del
  > curador, tiene también un bloque por sujeto: *«Nacidos Era 2 es opcional, **a partir de Era 1**, y
  > recomendable **antes de Viento y Verdad**»*.
  >
  > Con «sujeto solo obra», esta fase entregaría un editor de ventanas **incapaz de tocar ninguna de
  > las dos entradas que existen**. Los bloques no son el caso raro: son el caso.
  >
  > **Consecuencia dura: esta fase depende de la #198**, y no como una mejora deseable sino como
  > requisito. Y de sus dos mitades, no solo de la primera:
  > 1. la ficha ordena los bloques por el `position` mínimo de sus miembros, así que **contradice**
  >    visiblemente el orden curado;
  > 2. la sección «Cuando quieras» filtra sobre los **miembros**, de modo que **un bloque `libre` ni
  >    siquiera aparece ahí** — hoy los dos del Cosmere se pintan como grupos normales.
  >
  > Si (2) no se resuelve, no hay dónde colgar la ventana en la ficha, y el editor de 2b escribiría
  > un dato que ninguna pantalla enseña. **El orden correcto es #198 primero, 2b después.**
- **Las anclas sí pueden apuntar a un bloque**, y no es una excepción caprichosa: el caso que motiva
  la fase dice *«a partir de Era 1»*, y *Era 1* **es una subsaga**. Sujeto solo obra, anclas obra o
  bloque.
- Fase 3: retirada de `saga_nodes`/`saga_edges`/`save_saga_graph`, migración de los cuatro grafos a
  itinerarios y renombrado de `main-order.ts`.

## Modelo de datos

```sql
create table public.saga_placement_windows (
  id uuid primary key default gen_random_uuid(),
  saga_id uuid not null references public.sagas(id) on delete cascade,

  -- SUJETO: la entrada cuya ventana es esta. XOR obra/bloque.
  item_type public.item_type,
  item_id uuid,
  child_saga_id uuid references public.sagas(id) on delete cascade,

  -- ANCLA «a partir de». XOR obra/bloque, opcional.
  after_item_type public.item_type,
  after_item_id uuid,
  after_child_saga_id uuid references public.sagas(id) on delete cascade,

  -- ANCLA «recomendable antes de». Misma forma, opcional.
  before_item_type public.item_type,
  before_item_id uuid,
  before_child_saga_id uuid references public.sagas(id) on delete cascade,

  created_at timestamptz not null default now()
);
```

**Restricciones, y cada una está ahí por un motivo:**

- **Una fila por entrada**, con el mismo par de uniques parciales que ya protege `saga_nodes` y
  `saga_route_entries` (`20260723_saga_route_entries_uniques.sql`):

  ```sql
  create unique index saga_placement_windows_item_key
    on public.saga_placement_windows (saga_id, item_type, item_id) where item_id is not null;
  create unique index saga_placement_windows_child_key
    on public.saga_placement_windows (saga_id, child_saga_id) where child_saga_id is not null;
  ```

- **El sujeto es obra XOR bloque**, y las dos anclas también, cada una por su lado. Los tripletes son
  verbosos a propósito: `item_id` es polimórfico (`book | movie | series`) y colapsarlo perdería el
  tipo. Es el patrón que ya usan las dos tablas hermanas.
- **Al menos un ancla.** Una ventana sin anclas es simplemente un `libre` sin ventana, y entonces no
  hay fila. Ojo al escribir este CHECK: la fase 1 ya se quemó con la lógica de tres valores —un `OR`
  entre comparaciones que dan `NULL` propaga `NULL`, y un CHECK solo rechaza `FALSE`—, así que se
  escribe sobre `IS NOT NULL`, que nunca da `NULL`.
- **RLS**: `SELECT` público, escritura `collaborator+`. Igual que `saga_items`.

### Lo que el esquema NO puede garantizar

**«Solo las entradas `libre` tienen ventana» no se puede imponer con un CHECK**, porque cruza dos
tablas. Lo garantizan dos cosas, y las dos hacen falta:

- **El RPC es el único escritor** y borra las ventanas de las entradas que dejan de ser `libre` en la
  misma transacción en que las mueve de zona.
- **El render ignora** la ventana de una entrada que no sea `libre`, en vez de confiar en que no
  exista.

### Anclas que dejan de resolver

Una obra anclada puede salir de la saga después. No hay FK que lo impida: `after_item_id` apunta al
catálogo, no a la membresía. Y no puede haberla, porque la membresía no tiene clave propia estable a
la que referirse.

La salida **no** es que el RPC limpie las anclas rotas. Lo he considerado y lo descarto: exigiría
recorrer el subárbol dentro de la función —una consulta recursiva que hoy no hace— y aun así solo
arreglaría la ventana **la próxima vez que alguien guarde esa saga**, que puede no pasar nunca. Es
maquinaria cara para media garantía.

La regla es más simple, y reparte el trabajo donde cada uno puede hacerlo bien:

- **Al pintar**, un ancla que no resuelva contra el subárbol cargado **se omite**. Degradación
  honesta: mejor media frase cierta que una referencia rota. Si no resuelve ninguna, no se pinta
  línea.
- **Al curar**, el editor **sí la enseña**, marcada como rota, con la opción de quitarla. Es deuda de
  curación visible, exactamente el mismo criterio que la zona «Sin clasificar»: el dato malo se ve,
  no se esconde.
- **Al guardar**, no hay limpieza especial: si el curador no toca el ancla rota, se vuelve a guardar
  tal cual. Eso es deliberado — la obra puede volver a la saga, y borrarle el ancla por su cuenta
  sería tirar curación que quizá siga siendo válida mañana.

> ### ⚠️ Riesgo nombrado: esto son aristas otra vez, con otro nombre
>
> Lo mismo que advertía el spec de la fase 1, y sigue vigente. Lo que impide que estas filas degeneren
> en el lienzo que la fase 2a retiró es **la restricción dura**: una fila por entrada, dos anclas como
> máximo, solo para entradas `libre`, y curadas con **dos selectores** — nunca arrastrando en un
> canvas.
>
> **Si alguna vez se relaja el unique, se admite un tercer tipo de ancla, o se permite que una ancla
> apunte fuera del subárbol, se ha vuelto al punto de partida y hay que decirlo en voz alta.** Esta
> frase existe para que quien lo proponga tenga que leerla antes.

## El guardado, y una trampa de despliegue que la regla de siempre no cubre

`save_saga_sequence` gana un quinto parámetro:

```sql
save_saga_sequence(p_saga_id uuid, p_entries jsonb, p_blocks jsonb, p_removed jsonb, p_windows jsonb)
```

Aquí hay un detalle que **no** resuelve la regla «migraciones antes que el código» que la fase 1 dejó
escrita. Aquella regla basta cuando el cambio es **aditivo**; este no lo es. En Postgres, añadir un
parámetro **no reemplaza** la función: crea una **sobrecarga**. Y si se borra la versión de cuatro
argumentos para evitar dos firmas conviviendo, **el bundle ya desplegado —que llama a la de cuatro—
se rompe** en la ventana entre la migración y el despliegue.

**La secuencia correcta son tres pasos, en tres migraciones:**

1. Crear la versión de **cinco** argumentos con toda la lógica nueva, y **reescribir la de cuatro como
   un envoltorio** que la llama con `p_windows => '[]'::jsonb`. Las dos conviven; el bundle viejo
   sigue funcionando exactamente igual.
2. Desplegar el código nuevo, que llama a la de cinco.
3. **Solo entonces**, borrar la de cuatro, en su propia migración.

Saltarse el paso 1 es la forma de romper producción con un cambio que en el diff parece aditivo.

**Lo que el RPC escribe**, dentro de la misma transacción que ya usa: borra todas las ventanas de esta
saga cuyo sujeto no viaje en `p_windows`, e inserta o actualiza las que sí. Reemplazo total **de las
ventanas de esta saga**, que aquí sí es correcto —a diferencia de `saga_items`— porque **no hay un
segundo escritor**: ninguna otra pantalla crea ventanas.

## Validación previa al envío

Se suma a la que ya existe en `validate-sequence-draft.ts`:

- El sujeto de una ventana **está en la zona «Cuando quieras»** del borrador. Si no, no hay ventana.
- **Como máximo una ventana por entrada** y **como máximo dos anclas**, una de cada tipo.
- Un ancla **nunca apunta a su propio sujeto** — decir «se lee a partir de sí misma» no significa
  nada.
- Las dos anclas **apuntan a algo del mismo árbol**: una obra o un bloque del subárbol de esta saga.
- **Al menos un ancla**, o no se manda fila.

Ninguna de estas bloquea el resto del guardado más de lo que ya lo hace hoy: son errores de dominio
con su código, como el resto.

## Vistas

### El editor

Dentro de la zona «Cuando quieras», cada fila gana un control **«+ Añadir ventana»** que despliega dos
selectores: *a partir de* y *recomendable antes de*. Cada uno abre un diálogo para elegir la obra o el
bloque.

**Se reutiliza el patrón de `tandem-picker.tsx`, no se inventa otro**, y conviene saber por qué: ese
componente ya resolvió los mismos tres problemas en la fase 2a, y los resolvió tras dos rondas de
revisión —**radios nativos** (que traen la navegación con flechas gratis, en vez de un `radiogroup` a
mano que promete lo que no cumple), **filtro que normaliza acentos** con `normalizeTitle` de
`title-match.ts`, y **estado vacío explicado** en vez de un panel en blanco—. Repetir ese diálogo
desde cero sería repetir sus tres bugs.

Cuando la ventana tiene sus dos anclas, el control de añadir desaparece: el tope está alcanzado y se
ve que está alcanzado.

### La ficha

La sección «Cuando quieras» de `saga-info.tsx` ya existe y hoy pinta una rejilla de portadas. Gana,
bajo cada entrada con ventana, una línea de texto:

> *a partir de **Nacidos de la Bruma Era 1** · recomendable antes de **Viento y Verdad***

Con una sola ancla, media frase. Sin anclas que resuelvan, ninguna línea — y la entrada sigue
apareciendo en su sección, que es lo que importa.

## Migración

Orden no negociable (`AGENTS.md`): **dev primero, prod después**, verificando contra los objetos
reales (`pg_class`, `pg_proc`, `pg_policies`, `pg_constraint`), **nunca** contra `list_migrations`.

Todo el esquema de esta fase es **nuevo**: una tabla que no existía y una sobrecarga de función. No
hay backfill, porque no hay ninguna ventana que rescatar — y no hay ninguna entrada `libre` de la que
pudiera colgar.

## Pruebas

- **Unitarias sobre la validación** (función pura): un caso por regla, cada uno con su gemelo que no
  la dispara. Y la comprobación que la fase 2a enseñó a exigir: **inyección de fallo**, desactivando
  cada regla y viendo caer solo su prueba.
- **Unitarias sobre el borrador**: añadir y quitar anclas, y sobre todo **que mover una entrada fuera
  de «Cuando quieras» se lleve su ventana por delante**, que es la coherencia que el esquema no puede
  imponer.
- **E2E**: curar una ventana, guardar, recargar y verla en la ficha; y el caso de la coherencia —
  mover la entrada a la secuencia y comprobar **contra la base de datos** que la ventana desapareció.
- Los e2e de esta pantalla ya corren **en dos viewports** y con `:visible` en todos los locators;
  los casos nuevos siguen esa disciplina, que en la fase 2a hizo falta descubrir a golpes.

## Riesgos conocidos

- **El riesgo nombrado de arriba** es el principal, y no tiene mitigación técnica: solo la
  restricción dura y que alguien la defienda.
- **Construir para nadie.** Es el motivo de la puerta de entrada al principio de este documento. Si al
  curar el Cosmere la ventana no hace falta, la mejor versión de esta fase es no escribirla.
- **La sobrecarga de la función** convive en producción durante un despliegue. Es un estado
  intermedio deliberado y con fecha de caducidad: si el paso 3 no se hace, quedan dos firmas para
  siempre y la siguiente persona no sabrá cuál manda.
- **La ventana solo se ve en la ficha, no en el mapa ni en los itinerarios.** Es coherente con que su
  sujeto sea una entrada sin hueco, pero conviene decirlo: un lector que use el mapa no verá esa
  información.

## Dependencia

- La fase 2a, **mergeada y desplegada** el 2026-07-26.
- ~~La **puerta de entrada**: curar a mano las sagas que motivan la fase antes de empezar.~~
  **Cruzada el 2026-07-26** (ver el resultado arriba): la fase se construye.
- **La issue #198, y es bloqueante**, no una mejora paralela. Las dos entradas `libre` que existen
  son bloques; mientras la ficha no lea la colocación de un bloque ni tenga sección donde pintar un
  bloque `libre`, esta fase escribiría un dato que ninguna pantalla enseña. **Primero #198.**
