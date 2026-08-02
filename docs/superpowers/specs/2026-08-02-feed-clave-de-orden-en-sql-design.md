---
[Canónico · verificado 2026-08-02]
---

# Feed: la clave de orden debe existir en SQL

Cierra [#346](https://github.com/borjar20/Biblioshare/issues/346), y de paso la clase de fallo que
produjo seis defectos en la rama anterior.

## Problema

El feed ordena por `(día(eventDate), sortDate, id)` descendente, pero **`eventDate` se calcula en
JavaScript**: `sessionRelativeBasis` devuelve el timestamp de registro cuando la columna de fecha es
de hoy, y la columna en crudo el resto del tiempo. Postgres no puede ordenar ni paginar por un valor
que no existe en ninguna columna, así que cada consulta de fuente ordena por su columna de fecha —
que **no es** la clave real— y acota con un `.lte` sobre esa misma columna.

De ese desajuste salen tres síntomas que hasta ahora se han tapado por separado:

1. **La cota `+1`** (`dateUpperBoundInclusiveOfUtcSkew`): hizo falta porque el día de la clave puede
   ser el día UTC del timestamp mientras la columna es una fecha local.
2. **La guarda de `sessionRelativeBasis`**: hizo falta porque una fecha futura o un `created_at`
   viejo alejaban el día de la clave de su columna más de lo que la cota podía absorber.
3. **La inanición de #346**: la cota es **constante** para todas las páginas que caen en el mismo día
   del cursor, así que con `order(columna desc).limit(pageSize)` la consulta devuelve **las mismas**
   `pageSize` filas en cada página. Las que sobran de ese día no se sirven jamás — y como al quedar
   `fresh` vacío `nextCursor` pasa a `null`, **la paginación termina** y todo lo más antiguo, en
   todas las fuentes, se vuelve inalcanzable.

El keyset compuesto que propone #346 no cierra el problema: `finished_on.eq.<día>` no selecciona las
mismas filas que `día(eventDate) == <día>` cuando hubo sustitución. Trataría el síntoma 3 dejando
vivos el 1 y el 2.

## Comportamiento acordado

- El orden del feed pasa a ser **`(columna_fecha, timestamp_registro, id)`** descendente: tres
  columnas reales, con lo que la clave es expresable en SQL.
- `eventDate` deja de participar en el orden. Queda **solo para presentación**: el «hace x» de la
  tarjeta y la ventana de agrupación, que son las dos cosas que legítimamente quieren la fecha
  semántica.
- Cada consulta de fuente ordena por esas tres columnas y pagina con un keyset compuesto exacto, de
  modo que ninguna página puede repetir filas ya servidas ni dejar sin servir el resto de un día.
- El orden visible solo cambia allí donde hoy está mal: una fila cuya sustitución movía su día.

Por fuente, el par (columna de fecha, timestamp de registro):

| Fuente | Columna de fecha | Timestamp de registro |
|---|---|---|
| `added` | `passes.created_at` | `passes.created_at` |
| `progressed` | `progress_sessions.session_date` | `progress_sessions.created_at` |
| reseñas | `passes.finished_on` | `passes.updated_at` |
| episodios | `episode_watches.watched_on` | `episode_watches.created_at` |
| clubes | su `created_at` | el mismo `created_at` |

## Enfoque elegido

`FeedEvent` gana un campo explícito de orden — la columna de fecha de su fuente— junto a los que ya
tiene. La clave pasa a leer ese campo en vez de derivar el día de `eventDate`. `eventDate` y
`sortDate` se conservan con su significado actual: presentación y hora real de registro.

El cursor serializa los tres componentes reales. `isAfterCursor` los compara en el mismo orden, y
cada consulta traduce esa misma comparación a un filtro exacto:

```ts
q = q
  .order(dateColumn, { ascending: false })
  .order(stampColumn, { ascending: false })
  .order("id", { ascending: false });

if (cursor) {
  q = q.or(
    `${dateColumn}.lt.${cursor.date},` +
      `and(${dateColumn}.eq.${cursor.date},${stampColumn}.lte.${cursor.stamp})`,
  );
}
```

`.or()` acepta filtros PostgREST en crudo y admite `and(...)` anidado (verificado contra la
documentación de `postgrest-js`). La cota es inclusiva en el borde y el descarte fino lo sigue
haciendo `isAfterCursor` en cliente, que es lo que elimina el propio evento del cursor.

**Desaparecen** `dateUpperBoundInclusiveOfUtcSkew`, `addedUpperBound` y `timestampUpperBound`: eran
compensaciones del desajuste que esta spec elimina. La guarda de `sessionRelativeBasis` **se
conserva**, porque sigue protegiendo la coherencia del «hace x» (no inventar una hora para un evento
lejano), aunque ya no sea la paginación quien dependa de ella.

## Alternativas descartadas

**El keyset compuesto literal de #346.** Menor cambio, arregla la inanición en el caso común, pero
deja el desajuste de fondo: la cota sigue sin corresponder a la clave real cuando hubo sustitución,
así que las compensaciones 1 y 2 tendrían que quedarse y la clase de fallo sigue viva.

**Sobre-leer más de `pageSize` por fuente.** No arregla nada, solo sube el umbral al que reaparece el
fallo, y lo hace en silencio.

**Ordenar por el timestamp de registro globalmente.** Cierra el problema, pero cambia el significado
del feed a «lo que se ha registrado»: lo backdateado subiría al principio. Ya se descartó en la spec
del 2026-08-02 anterior y esa decisión sigue en pie.

## Datos y fronteras

- Sin cambios de esquema, RLS ni migraciones: las cinco columnas ya existen y ya se seleccionan.
- Sin cambios de copy.
- El formato del cursor cambia de nuevo. Los formatos anteriores se siguen aceptando y degradan sin
  romper la paginación, como ya hace el legado.
- La agrupación no cambia: sigue leyendo `eventDate`, que sigue siendo la fecha semántica.

## Pruebas

- **La prueba que faltaba:** un día con **más de `pageSize` filas en una sola fuente** se pagina
  entero, y todo lo anterior a ese día se sigue sirviendo. Es la reproducción de #346 y debe
  observarse en rojo antes del arreglo.
- El recorrido completo de paginación existente debe seguir en verde: cada fila exactamente una vez,
  con granularidades mezcladas, filas backdateadas y una sesión con fecha futura.
- Un cursor de cualquiera de los formatos anteriores no pierde ni repite filas.
- La query de cada fuente emite el filtro compuesto esperado; el doble de Supabase debe aplicarlo de
  verdad, no solo registrarlo.

## Riesgos y comprobaciones

- **El riesgo es el mismo de siempre y ya ha mordido seis veces:** que el filtro SQL y
  `isAfterCursor` dejen de coincidir. La diferencia es que ahora *pueden* coincidir exactamente, en
  vez de aproximarse; el test de recorrido completo es lo que lo comprueba.
- El doble de test aplica los filtros como cadenas JavaScript; que eso siga equivaliendo al
  comportamiento de Postgres depende de que todos los timestamps lleven el sufijo `+00:00`, que es lo
  que rastrea [#347](https://github.com/borjar20/Biblioshare/issues/347). No lo resuelve esta spec.
- Al desaparecer tres helpers hay que comprobar que ningún consumidor los importaba.
