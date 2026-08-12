# Confirmar y desmarcar un hito de lectura conjunta

[Canónico · verificado 2026-08-12]

Marcar un hito se activa de una sola pulsación y no hay forma de deshacerlo.
Desde que el marcado es **autodeclarado** (#471) eso pesa más: ya no hay una
comprobación de página que respalde el gesto, así que un clic accidental te
declara en un punto de la historia donde no estás — y te abre un chat que puede
destriparte lo que aún no has leído.

Esta spec añade una confirmación explícita al marcar y la posibilidad de
desmarcar. Y arregla, de paso, un fallo de orden de gates en la función que ya
existía.

---

## 1. Punto de partida

**Confirmar es autodeclarativo desde #471** (`20260827_hitos_autodeclarados.sql`).
El gate numérico contra la página se retiró porque cada participante lee una
edición distinta y el mismo número cae en puntos distintos de la historia. Hoy
`confirm_checkpoint` solo exige ser participante.

**Confirmar el hito N auto-confirma del 1 al N**, idempotente, para que quien
salte a un hito tardío no deje huecos detrás.

**Confirmar abre el chat de ese hito.** El guard anti-spoiler
(`can_view_target`) es «participante Y ha llegado»: hasta que confirmas, el hilo
está tapado con la banda rayada.

**`club_activity_checkpoint_reads` no tiene política de escritura de cliente**,
a propósito: todo pasa por RPC `security definer`. No hay ningún camino de
borrado, así que desmarcar exige una función nueva — no es cuestión de exponer un
`delete`.

---

## 2. Decisiones

### D1 · Desmarcar el hito N desmarca también N+1 en adelante

Simétrico a la cascada de confirmar. El invariante que se protege es que **tu
progreso es siempre un tramo continuo desde el principio**, que es lo único que
significa algo en una lectura: «voy por el hito 3».

Descartado desmarcar solo el hito pulsado: permitiría estados sin sentido —«he
llegado al 5 pero no al 2»— y, como el tablero de grupo mide por el hito más alto
alcanzado, el hueco no cambiaría ningún número. Sería un estado inconsistente que
además no sirve para nada.

Descartado permitir desmarcar solo el último: obliga a deshacer hacia atrás uno a
uno para corregir un error en el hito 2.

### D2 · La confirmación va en el sitio, no en un diálogo

Al pulsar, el propio botón se convierte en `¿Seguro? [Sí] [No]`. Dos pulsaciones
deliberadas, sin abrir nada encima.

Un modal tiene más sitio para explicar, pero esto se hace varias veces por
lectura y taparía la lista de hitos, que es justo lo que estás mirando para
decidir. Descartado también «mantener pulsado»: es imposible de activar sin
querer, pero es un gesto que hay que descubrir y en escritorio resulta ajeno.

### D3 · Al desmarcar se avisa de lo que cae, y solo de lo que cae

El texto de confirmación es **dinámico**:

- Nombra los hitos posteriores **solo si los hay**.
- Menciona el chat **solo si tú has escrito en él**.

Un aviso que no aplica enseña a ignorar los avisos. Un hito sin posteriores y sin
comentarios tuyos pide confirmación a secas.

### D4 · Perder de vista el chat se avisa, no se impide

Si desmarcas un hito donde comentaste, tus mensajes **siguen ahí** y los demás
los ven; lo que pierdes es el acceso, y vuelve en cuanto lo marques otra vez.

Descartado bloquear el desmarcado en ese caso: te dejaría atrapado por un
comentario de una palabra, y el caso de uso que motiva la spec —me lo marqué sin
querer— puede venir justo después de haber curioseado el chat.

### D5 · Se arregla el orden de gates de `confirm_checkpoint`

Hoy comprueba `not found` **antes** que el permiso, así que revela si un uuid de
hito existe a quien no participa en la actividad. Es la misma clase de fuga que
`20260831_club_activity_role_gate_first.sql` (issue #129) corrigió en cuatro RPC
de `club_activities`, y que volvió a aparecer hace un día en
`update_activity_details`.

Entra en esta spec aunque nadie lo haya pedido porque **escribir la función nueva
con el gate primero y dejar su gemela al revés consagra la incoherencia**: la
siguiente persona copiará una de las dos, y no hay forma de saber cuál. Son tres
líneas en la misma migración.

---

## 3. La RPC nueva

`unconfirm_checkpoint(p_checkpoint_id uuid)`, `security definer`,
`set search_path = public`, espejo de `confirm_checkpoint`:

| Situación | Excepción |
|---|---|
| No participas en la actividad — **gate primero** | `forbidden` |
| El checkpoint no existe | `not_found` (defensivo; con el gate primero, inalcanzable) |

Con el gate primero, un uuid inexistente deja `v_activity_id` nulo,
`is_activity_participant(null)` da `false` y también cae en `forbidden`: quien
pregunta no aprende si ese hito existe.

El borrado:

```sql
delete from public.club_activity_checkpoint_reads r
 using public.club_activity_checkpoints c
 where r.checkpoint_id = c.id
   and c.activity_id = v_activity_id
   and c."order" >= v_order
   and r.user_id = auth.uid();
```

`>=` es la cascada de D1, y borra **solo tus filas**: `r.user_id = auth.uid()`.
Idempotente — desmarcar dos veces seguidas no falla, borra cero filas la segunda.

`revoke execute … from public, anon` y `grant … to authenticated`, como el resto.

**No comprueba el estado de la actividad**, igual que `confirm_checkpoint`. La
asimetría sería peor que la permisividad: si puedes marcar en una actividad
finalizada, tienes que poder desmarcar.

---

## 4. La interfaz

Hoy un hito confirmado no tiene ningún control: solo un texto «chat abierto».
Ahí entra el botón de desmarcar.

```
sin confirmar   3. La huida                    [ He llegado ]
   al pulsar    3. La huida     ¿Seguro?       [Sí] [No]

confirmado      3. La huida     chat abierto   [ Desmarcar ]
   al pulsar    3. La huida     ¿Seguro? caen también 4 y 5,
                                y dejarás de ver su chat
                                [Sí] [No]
```

El paso de confirmación es estado local del componente, uno por hito: abrir el de
un hito cierra el de cualquier otro, para que no queden dos preguntas abiertas.

**La lista de hitos que caen se recorta a dos**, y el resto se cuenta: «caen
también 4, 5 y 3 más». Desmarcar el primer hito de una lectura con diez, si no,
produce una frase impracticable en el ancho de una fila.

### 4.1 Contar tus mensajes sin mentir

`InteractionComment` trae `isOwn`, así que contar los tuyos es filtrar. **Pero
`comments` viene con tope de 20** (`COMMENT_PREFETCH_LIMIT` en
`src/lib/social/interactions.ts`), mientras que `commentCount` es el total real.

En un chat de más de 20 mensajes, contar los tuyos sobre la lista recortada
**da un número menor que el verdadero**. Así que:

- Si `comments.length === commentCount` (no hay recorte), el aviso puede decir el
  número: «tus 2 mensajes se quedan».
- Si hay recorte, el aviso lo dice **sin número**: «tus mensajes se quedan».

Un número que resulta ser mentira gasta más confianza de la que ahorra al ser
exacto.

---

## 5. Superficies

```
nuevo   supabase/migrations/20260855_unconfirm_checkpoint.sql
nuevo   src/lib/clubs/activities/unconfirm-impact.ts
nuevo   src/lib/clubs/activities/unconfirm-impact.test.ts
edita   src/lib/clubs/activities/checkpoints.ts          unconfirmCheckpoint()
edita   src/components/clubs/checkpoints/checkpoint-list.tsx
edita   messages/es.json
```

`unconfirm-impact.ts` es una función pura que, dado el hito pulsado y la lista
completa, responde: qué hitos posteriores caen y si el aviso del chat aplica (y
con número o sin él). Va aparte porque es la única parte con reglas y la única
testeable sin navegador.

**El número de migración depende de qué haya fusionado antes.** `20260854` está
cogida por la rama de editar actividades; confirmar el siguiente libre contra los
ficheros, nunca contra el ledger.

---

## 6. Verificación

**Unitario**, sobre `unconfirm-impact`:
- hito sin posteriores → no nombra ninguno.
- hito con uno o dos posteriores → los nombra todos, en orden.
- hito con más de dos posteriores → nombra dos y cuenta el resto (§4).
- sin comentarios tuyos → el aviso del chat no aplica.
- con comentarios tuyos y lista completa → aplica, con número.
- con comentarios tuyos y lista recortada (`comments.length < commentCount`) →
  aplica, **sin** número. Es el caso que evita el número mentiroso.

**Contra dev**, la RPC:
- participante con 1–5 confirmados desmarca el 3 → le quedan 1 y 2.
- desmarcar dos veces seguidas → la segunda no falla.
- **no participante → `forbidden`**, y **también con un uuid de hito
  inexistente**. Los dos deben dar el MISMO código: es lo que prueba que el gate
  va primero. Si el segundo diera `not_found`, la fuga sigue.
- lo mismo contra `confirm_checkpoint` tras el arreglo de D5.
- que solo se borran TUS filas: con dos participantes confirmados, desmarcar uno
  no toca al otro.

**e2e:** una sola pulsación en «He llegado» **no** marca el hito; hace falta la
segunda. Y desmarcar un hito intermedio hace desaparecer los posteriores de la
lista.

**Después del cambio:** `data-model.md` (la RPC nueva y el orden de gates
corregido de la vieja) y `decisiones.md` (D1 y D5, al final, append-only).

---

## 7. Riesgos

**El progreso del grupo puede retroceder sin que nadie haya hecho nada visible.**
`groupSafeOrder` es el mínimo, entre participantes, del máximo alcanzado por cada
uno. Si alguien desmarca, esa línea baja para todos. Es correcto —era verdad y
deja de serlo— pero otro participante verá moverse hacia atrás el «todo el grupo
ha llegado hasta X» sin explicación. No se mitiga en esta spec; si molesta en uso
real, la salida es avisar en el tablero de quién movió qué, que es otra spec.

**Arreglar `confirm_checkpoint` toca una función viva y muy usada.** El cambio es
solo de orden de comprobaciones y no altera qué se escribe, pero conviene
verificar su camino feliz además del de error: un participante confirma y las
filas 1..N aparecen igual que antes.

**El recorte del aviso a dos hitos es una apuesta sin datos.** Nombrar dos y
contar el resto cabe en una fila, pero no sabemos si a alguien le basta para
decidir. Si en uso real resulta pobre, la salida es enseñar la lista completa en
un desplegable, no alargar la frase.
