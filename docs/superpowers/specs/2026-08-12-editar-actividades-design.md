# Editar una actividad de club ya creada

[Canónico · verificado 2026-08-12]

Dos carencias que se descubrieron juntas y **no comparten naturaleza**: los hitos
de una lectura conjunta parecían inmodificables (y no lo eran: el editor estaba
en otra pantalla), y la fecha de fin de una actividad no se puede cambiar en
nada que no sea un evento (eso sí es un hueco real, y necesita migración).

Es la **spec B** del encargo del 2026-08-12. La A —el rediseño de la pestaña
Actividades— va en `2026-08-12-actividades-club-rediseno-design.md` y en la PR
#598. Se separaron porque el riesgo no se parece: aquella es UI más una lectura
nueva; esta añade **escritura** sobre `club_activities`, que hasta hoy no tiene
ninguna política UPDATE de cliente.

Issues: **#597** (hitos) y **#596** (fecha de fin).

---

## 1. Problema

### 1.1 Los hitos sí se podían editar. El problema era encontrarlo

El diagnóstico inicial —«los hitos no se pueden mejorar una vez creados»— es
falso, y merece quedar escrito porque es el tipo de error que manda a la
siguiente persona a tocar RLS sin motivo. `createCheckpoint`, `updateCheckpoint`,
`deleteCheckpoint` y `reorderCheckpoints` existen (`checkpoints.ts:174-241`) y
sus políticas los permiten (`20260713_activity_checkpoints.sql:225-250`).

Lo que falla es **dónde vive el editor**. Los hitos se *ven* en el tablero de la
actividad (`BuddyReadCheckpoints`) y se *editan* en otra pantalla, «Modificar
actividad», detrás de un botón que no dice nada de hitos. El propio fichero lo
documenta sin darse cuenta de que está describiendo el problema:

> *Solo lectura: el alta/edición de hitos vive en «Modificar actividad»
> (BuddyReadCheckpointEditor).*

Y hay un detalle que lo confirma: **ese componente ya recibe `isModerator` como
prop y no lo usa** (`buddy-read-checkpoints.tsx:23`). El sitio para la acción
estaba previsto; nunca se conectó.

Confirmado con el usuario: era moderador, la actividad estaba activa —o sea,
tenía permiso y los controles habrían funcionado— y aun así concluyó que la
función no existía. **No es un problema de permisos. Es de descubribilidad.**

### 1.2 La fecha de fin no se puede cambiar. Eso sí es un hueco

`club_activities` no tiene política UPDATE de cliente, **a propósito**
(`20260713_club_activities.sql:196`): las transiciones van por RPC. Hoy existen
dos, y ninguna sirve:

| RPC | Qué edita | Por qué no vale |
|---|---|---|
| `update_club_event` | título, descripción, instante, zona, sitio, modalidad | Solo `kind = 'evento'` |
| `update_activity_config` | solo `config` | Solo en `proposed`, y no toca fechas |

Así que en una lectura conjunta, un reto o una tierlist, una fecha metida mal —o
un plazo que hay que alargar porque el grupo va más lento— no tiene arreglo. Ni
una errata en el título.

---

## 2. Decisiones

### D1 · Los hitos se gestionan donde se ven

El editor se **traslada** al tablero, bajo la lista, visible solo para
moderadores. No se reescribe: `BuddyReadCheckpointEditor` ya es autónomo, con su
propio fetch y su `onChanged`.

La alternativa barata era dejarlo donde está y poner un botón «Gestionar» en el
tablero que llevara allí. Se descarta: un cartel que explica dónde están las
cosas es peor que ponerlas donde se buscan, y deja dos pantallas para una sola
tarea. Si el sitio correcto es el tablero, el editor va al tablero.

«Modificar actividad» **no se queda vacía**: conserva el pool de ítems y la
modalidad de compleción, y gana el panel de la §3.

### D2 · La edición de cabecera va por RPC, como todo lo demás

No se añade una política UPDATE de cliente sobre `club_activities`. La ausencia
de esa política es una decisión de diseño del Bloque G, no un olvido: las
escrituras con autorización no trivial van por RPC `security definer` que
revalida en servidor. Se sigue el patrón.

### D3 · Quién puede, y hasta cuándo

**Moderador siempre** (en `proposed` y en `active`). **Creador solo mientras sea
una propuesta.**

El porqué: mientras nadie la ha aprobado, la actividad es de quien la propuso y
la retoca a su gusto. En cuanto el club la activa, pasa a ser un compromiso del
club —hay gente apuntada y progreso contándose— y quien la gobierna es la
moderación. Es exactamente el criterio de `update_activity_config`, con una
diferencia deliberada: aquella congela **al activar** para todo el mundo, y esta
deja seguir al moderador, porque alargar un plazo con la actividad en marcha es
el caso de uso que motiva la spec.

Consecuencia asumida, y conviene decirla en voz alta: **un creador que no modera
no puede corregir ni una errata de su propio título una vez activa.** Se acepta
por coherencia con el resto del gobierno del club; si duele en la práctica, se
revisa con datos, no por si acaso.

### D4 · Finalizada y archivada quedan congeladas

Fuera del alcance. La ventana temporal alimenta el cálculo de progreso de los
retos: cambiarla en una actividad terminada **reescribiría el historial** de
quién la completó y quién no. Si algún día hace falta, será su propia decisión y
su propia spec.

### D5 · Los eventos siguen con su RPC

`kind = 'evento'` queda fuera de la función nueva. Ya tiene `update_club_event`,
que además maneja hora, zona, modalidad y enlace. Dos RPC escribiendo los mismos
campos acaban divergiendo, y la que se quede atrás lo hará en silencio.

---

## 3. La RPC

`update_activity_details`, `security definer`, `set search_path = public`, en
plpgsql como su hermana:

```sql
update_activity_details(
  p_activity_id  uuid,
  p_title        text,
  p_description  text,     -- null borra la descripción
  p_starts_on    date,     -- null = sin fecha de inicio
  p_ends_on      date      -- null = sin fecha de fin
) returns void
```

Validaciones, en este orden, y **todas en el servidor** porque el servidor es la
autoridad (la interfaz valida lo mismo antes, solo para no hacer el viaje):

| Situación | Excepción |
|---|---|
| **Ni creador ni `moderator+`** — el gate va PRIMERO | `forbidden` |
| La actividad no existe | `not_found` (guarda defensiva, inalcanzable) |
| Creador **no** moderador y estado ≠ `proposed` | `forbidden` |
| `kind = 'evento'` | `use_update_club_event` |
| Estado ni `proposed` ni `active` | `dates_frozen` |
| Título vacío tras `trim` | `title_required` |
| `p_ends_on < p_starts_on` | `invalid_range` |

**El gate de rol va PRIMERO, y esto no es un detalle de estilo.** Esta función es
`security definer`, así que su `select` no pasa por la RLS: si comprobara la
existencia o el `kind` antes de autorizar, un `authenticated` que no es miembro
del club podría distinguir por el código de excepción si un uuid existe y si es
un evento — reabriendo por la puerta de atrás lo que la RLS de SELECT protege.

Es fuga de INFO, no de escritura, y **el repo ya la arregló una vez**: la
migración `20260831_club_activity_role_gate_first.sql` (issue #129) corrigió
exactamente esto en otras cuatro RPC de esta misma tabla. La primera versión de
esta función la reintrodujo, y la revisión la cazó. Con el gate primero, una fila
inexistente deja `v_club_id` y `v_created_by` nulos y también cae en `forbidden`,
así que `not_found` queda inalcanzable — se conserva como guarda, igual que en
las cuatro hermanas.

Regla, entonces, para la próxima RPC sobre `club_activities`: **el gate de rol
primero, siempre.**

`revoke execute … from public, anon` y `grant … to authenticated`, como el resto.

El cliente las traduce a mensajes con el mismo patrón de `mapError` que ya usa
`event-follow-actions.ts`: un conjunto cerrado de códigos conocidos, y cualquier
otra cosa cae en el genérico y se registra.

### Nota sobre el rango

`ends_on < starts_on` se rechaza, pero **`ends_on` en el pasado no**. Es
deliberado: cerrar hoy una lectura poniéndole la fecha de la semana pasada, que
es cuando de verdad terminó, es un uso legítimo. Lo que no tiene sentido es una
ventana invertida.

---

## 4. El aviso de la ventana

En `list_challenge` y `criteria_challenge` **activos**, y solo ahí, el formulario
avisa antes de guardar: mover las fechas **recalcula el progreso de todos los
participantes**, porque `activity_window` (`20260714_criteria_challenge.sql:16`)
es lo que decide qué lecturas caen dentro y cuáles no.

No es una advertencia decorativa: alargar el plazo puede hacer que a alguien le
aparezca completado un reto que ayer no lo estaba, y acortarlo puede quitárselo.
Que se decida con eso delante.

**En `buddy_read` y `tierlist` no aparece.** Su progreso sale de los hitos
alcanzados y de las colocaciones, que no miran la ventana. Un aviso que no aplica
enseña a ignorar los avisos.

---

## 5. Superficies

```
nuevo   supabase/migrations/20260854_update_activity_details.sql
nuevo   src/components/clubs/activity-details-editor.tsx   panel de cabecera
edita   src/lib/clubs/activities/core.ts                   updateActivityDetails()
edita   src/components/clubs/checkpoints/buddy-read-checkpoints.tsx
edita   src/components/clubs/activity-detail.tsx
edita   messages/es.json

intacto src/components/clubs/checkpoints/checkpoint-editor.tsx   se traslada, no se reescribe
intacto src/components/clubs/checkpoints/checkpoint-manager.tsx
```

**El número de migración depende de la PR #598**, que trae la `20260853`. Si esa
rama se fusiona antes, esta es la `20260854`; si no, hay que coger el siguiente
libre y confirmarlo contra los ficheros, no contra el ledger.

### Qué ve cada quién en el tablero

| | Lista de hitos | Editor |
|---|---|---|
| Miembro del club | sí (ya hoy, ayuda a decidir si unirse) | no |
| Participante | sí, con su progreso | no |
| Moderador, actividad `active` | sí | **sí** |
| Moderador, actividad `proposed` | sí | no: una línea explicando que se abren al activar |
| Moderador, sin ítem en el pool | — | no: el aviso que ya existe, con enlace a «Modificar actividad» |

Las dos últimas filas son la parte que hoy no existe. Al mover el editor a un
sitio visible, sus estados apagados dejan de ser un detalle escondido: **un
control muerto sin explicación es peor que ningún control**, y era medio problema
de partida.

---

## 6. Verificación

**Unitario (Vitest).** La validación de rango y de título como función pura,
compartida entre formulario y `mapError`: rango invertido, título en blanco,
título con solo espacios, fechas nulas (válidas: quitar la fecha es legítimo).

**Contra dev, la RPC, caso por caso.** Los siete de la tabla de §3. Dos que se
cuelan con facilidad y hay que probar a propósito:

- **Creador NO moderador con la actividad ya activa** → `forbidden`. Es la regla
  de D3 y es la única que no se deduce del nombre de la función.
- **Un evento** → `use_update_club_event`, no un update silencioso.

**e2e.** Cambiar la fecha de fin de una actividad activa y comprobar que el
cambio se ve en la tarjeta de la pestaña Actividades (que es donde el usuario lo
va a mirar), y que un moderador encuentra el editor de hitos **sin pasar por
«Modificar actividad»** — que es, literalmente, el fallo que origina #597.

**Después del cambio**, y sin esto no está hecho:

- `docs/requirements/data-model.md`: la RPC nueva y su fecha de verificación.
- `docs/requirements/decisiones.md`: al final, D3 (por qué el creador pierde el
  control al activarse) y D1 (por qué los hitos se editan en el tablero).
- Cerrar **#596** y **#597**. En #597, **decir al cerrarla que su diagnóstico era
  incorrecto**: los helpers de escritura existían y la RLS los permitía; lo que
  fallaba era el acceso. Un diagnóstico equivocado que sobrevive en el repo manda
  a la siguiente persona en dirección contraria, y en este proyecto ya ha pasado
  dos veces (#106 y #117).
- No se añade ninguna columna → la superficie 6 de `DRIFT-CHECK.md` no aplica.

---

## 7. Riesgos

**Es la primera escritura de cliente sobre la cabecera de `club_activities`.**
Hasta ahora esa tabla solo se escribía por RPC de transición de estado. La
función nueva es también RPC, así que el invariante se mantiene, pero la
superficie de escritura crece: cualquier campo que se le añada después tiene que
volver a pasar por las preguntas de la §3, sobre todo la de quién y hasta cuándo.

**Mover el editor de hitos mueve una superficie que funciona.** El riesgo no es
el componente —es autónomo—, sino los estados que hoy nadie ve porque están
escondidos: en propuesta se pinta `disabled`, y sin ítem no se pinta. En el
tablero, esos dos casos son visibles para todos los moderadores y necesitan texto
propio. Están en la tabla de §5; si se implementan sin ellos, el resultado es un
hueco mudo donde antes había una pantalla que al menos no se veía.

**El aviso de la ventana puede quedarse corto.** Avisa, pero no dice *cuánto*
cambia: no calcula a quién afecta. Hacerlo bien exigiría simular el progreso con
las fechas nuevas antes de guardar, que es otra spec. Si el aviso resulta
insuficiente en uso real, esa es la dirección.
