# Mascota S1: madriguera compartida

> **[Histórico · congelado 2026-09-06 · PENDIENTE DE IMPLEMENTAR]** Spec de diseño de la primera
> pieza social de la mascota (#1083): las mascotas de la gente que sigues junto a la tuya, en
> `/mascota`. Sale del brainstorming del 2026-09-06 sobre la PR #1079. Los principios están en la
> Parte I §20 de `docs/design/2026-09-06-mascota-rpg-evolucion-por-fases.md` y el hito es el S1 de
> su Parte II (vía S, en paralelo a los hitos R del combate). Explica el *porqué*; el estado de hoy
> manda en el código.

## Criterio

**Compañía, no comparación.** La mascota sale de tu pantalla para acompañar: ves a las mascotas de
la gente que sigues junto a la tuya, y ellas ven la tuya. Nada de lo que se muestra ordena, cuenta
ni juzga: ni nivel, ni humor ajeno, ni ranking. Es la extensión natural de «espejo, no máquina de
culpa» (fases 1 a 3) al terreno social: un ranking por nivel sería un ranking de lectura.

## 1. Decisiones del brainstorming (2026-09-06)

| Pregunta | Decisión |
|---|---|
| Qué siente quien ve una mascota ajena | **Compañía**: verlas juntas, sin orden ni números. Descartadas como objetivo la identidad (aparece como consecuencia), la comparación (ranking) y la interacción (reacciones, regalos, visitas) |
| Dónde vive | **Sección «Madriguera» en `/mascota`**, debajo de la ficha propia y antes de «Qué la sube». La franja en inicio y la escena del club quedan como ampliaciones |
| Cuánto se ve de cada vecina | **Siempre despiertas**: sprite (clase y etapa), nombre, clase, etapa y dueño. Nunca el nivel ni el humor |
| Cómo se exponen los datos ajenos | **RPC de columnas exactas** con helper privado; sin política nueva en `pet_state` |

## 2. Alcance

**Dentro:** la sección «Madriguera» con la escena, la tarjeta al tocar, los estados vacíos, el RPC
`get_burrow_pets()` con su helper privado, la lectura en la app, tests unitarios, de componente,
matriz SQL y e2e, y la doc canónica.

**Fuera (registrado en #1083 y en la Parte II):** ranking en cualquier forma; humor ajeno (posible
ampliación con interruptor del dueño, apagado por defecto); mascota en el perfil público y en la
imagen OG (S2); madriguera del club (S3); reacciones, regalos y visitas; interruptor «no mostrar mi
mascota»; franja compacta en inicio.

## 3. Experiencia

### 3.1. La escena

- Sección con título «Madriguera», entre la ficha propia y «Qué la sube».
- Una franja de suelo en el estilo de la compañera. Las mascotas en fila que se envuelve en móvil:
  **la tuya primero, marcada como tuya**, y después las de tus seguidos. Todas con `PetSprite` en
  idle, humor `neutral`, dirección por defecto (suroeste, como la compañera) y escala 1.
- **Sin orden con significado**: el RPC ya devuelve las vecinas mezcladas por un hash de
  espectador, día y dueño, así que la fila cambia cada día y nadie está «el primero» por nada.
- **Doce visibles** y, si hay más, un botón «Ver las N» que despliega el resto en la misma fila.
  N es el total que devuelve el RPC (tope de sesenta filas); es un recuento de vecinas, no un
  ranking.

### 3.2. Tocar una vecina

Cada sprite es un `<button>`. Al tocarlo, una tarjeta bajo la escena muestra: nombre de la
mascota, clase y etapa (con las etiquetas que ya usa la ficha), y el dueño con avatar y arroba
enlazando a `/u/<username>`. Tocar tu propia mascota muestra la misma tarjeta sin dueño. Tocar
otra sustituye la tarjeta; tocar la seleccionada la cierra. Solo puede haber una tarjeta abierta.

### 3.3. Estados vacíos y bellotas

- **No sigues a nadie:** texto y enlace a `/buscar?modo=personas`.
- **Sigues gente pero nadie ha eclosionado:** texto sin enlace.
- Las bellotas, propia y ajenas, salen como bellota: es una etapa (`acorn`), no un dato de
  actividad distinto del que ya da cualquier sprite.
- Si el RPC falla, la sección muestra una línea discreta («no se ha podido cargar la madriguera»)
  y la página sigue entera.

### 3.4. Accesibilidad

- Cada botón lleva `aria-label` con nombre, clase, etapa y dueño («Nube, maga adulta de @ana»).
- La lista es un `<ul role="list">` con un `<li>` por mascota; la tarjeta es una región con
  `aria-live="polite"` para que el cambio de selección se anuncie.
- Movimiento reducido: lo respeta `PetSprite` (la animación idle ya lo contempla); la sección no
  añade movimiento propio.

### 3.5. Copys

Claves nuevas en el namespace `pet` de `messages/es.json`, el único locale que existe hoy (agente
`i18n-keeper`): `burrow.title`, `burrow.yours`, `burrow.showAll` (con `{count}`),
`burrow.emptyNoFollows`, `burrow.findPeople`, `burrow.emptyNoPets`, `burrow.spriteLabel` (con
`{name}`, `{class}`, `{stage}`, `{owner}`), `burrow.ownLabel`, `burrow.error`. Clase y etapa
reutilizan las claves existentes de la ficha.

## 4. Datos

### 4.1. Visibilidad

Tu mascota la ven quienes pueden ver tu perfil: `public.can_view_profile(user_id)` (dueño, perfil
público o seguimiento aceptado; nunca entre bloqueados, `public.users_are_blocked`). Es la misma
función que gobierna sesiones, pases y biblioteca. La madriguera además solo muestra **a quien
sigues con seguimiento aceptado**: quien te sigue a ti no aparece en tu madriguera por eso, sino
solo si tú también le sigues.

### 4.2. El RPC

Patrón de los helpers privados de Social fases 0/1 (`data-model.md`, sección de seguridad): el
helper con privilegios de definidor vive en el esquema no expuesto `private`, cualifica todas las
referencias y fija `search_path = ''`; la función pública es `SECURITY INVOKER` y delega en él.

```sql
-- supabase/migrations/<fecha>_get_burrow_pets.sql (dev primero, prod después)
create or replace function private.burrow_pets(p_viewer uuid, p_limit integer)
returns table (
  user_id uuid, username text, display_name text, avatar_url text,
  pet_name text, pet_class text, pet_stage text, total bigint
)
language sql stable
security definer
set search_path = ''
as $$
  select f.followee_id, pr.username, pr.display_name, pr.avatar_url,
         ps.name, ps.class, ps.last_stage, count(*) over ()
  from public.follows f
  join public.pet_state ps on ps.user_id = f.followee_id
  join public.profiles pr on pr.user_id = f.followee_id
  where f.follower_id = p_viewer
    and f.status = 'accepted'
    and f.followee_id <> p_viewer
    and public.can_view_profile(f.followee_id)
    and not public.users_are_blocked(f.followee_id)
  order by md5(p_viewer::text || (now() at time zone 'utc')::date::text || f.followee_id::text)
  limit p_limit;
$$;

create or replace function public.get_burrow_pets(p_limit integer default 60)
returns table (
  user_id uuid, username text, display_name text, avatar_url text,
  pet_name text, pet_class text, pet_stage text, total bigint
)
language sql stable
security invoker
set search_path = ''
as $$
  select * from private.burrow_pets(
    (select auth.uid()),
    least(greatest(coalesce(p_limit, 60), 1), 60)
  );
$$;

revoke all on function public.get_burrow_pets(integer) from public, anon;
grant execute on function public.get_burrow_pets(integer) to authenticated;
```

- `can_view_profile` y `users_are_blocked` leen `auth.uid()`, que dentro del definidor sigue siendo
  el que llama, es decir, el mismo `p_viewer`. El helper recibe `p_viewer` como argumento para
  poder ejecutarlo en la matriz SQL fijando `request.jwt.claims` al mismo usuario.
- Los grants que necesita la función pública para llamar al helper (`usage` del esquema `private`
  y `execute` del helper para `authenticated`) se copian **exactamente** del precedente
  `can_view_interaction_target` → helper privado, en las migraciones de Social fase 0/1.
- `count(*) over ()` da el total antes del `limit`, para «Ver las N».
- Sin sesión (`auth.uid()` nulo) no devuelve filas; `anon` no puede ejecutarla.

### 4.3. Orden, tope y total

- El orden es `md5(espectador || día UTC || dueño)`: determinista para el mismo espectador el mismo
  día, distinto al día siguiente. La fecha en UTC solo afecta al orden, nunca a la corrección.
- Tope duro de sesenta filas en SQL; la interfaz enseña doce y despliega el resto. Con más de
  sesenta vecinas con mascota se ven sesenta y el total real; es un límite asumido sin víctima
  hoy (producción tiene tres cuentas).

### 4.4. Lo que NO cambia

- **Ninguna política nueva en `pet_state`.** `last_level`, `companion_hidden`, `hatched_at` y
  `last_stage` como columna cruda no salen por la API a terceros: solo lo que devuelve el RPC.
- `get_companion_state()` y `getPetSnapshot` siguen igual.
- No hay tabla nueva ni columna nueva: no aplica la superficie 6 de `DRIFT-CHECK.md` (grants por
  columna), sí la de funciones (`pg_proc`, `prosecdef`, `proconfig`).

### 4.5. Migración y verificación

Dev (`supabase-dev`) primero; después prod. Verificar contra los objetos reales, no el ledger:
las dos funciones existen, `private.burrow_pets` es `prosecdef` con `proconfig = search_path=`,
`public.get_burrow_pets` no es definidor, `anon` no tiene `execute`, `authenticated` sí, y el
advisor de seguridad no añade avisos. La consulta de `data-model.md` que lista definidores en
`public` con `search_path=public` debe seguir saliendo vacía.

## 5. Código

| Pieza | Dónde | Qué hace |
|---|---|---|
| Migración | `supabase/migrations/<fecha>_get_burrow_pets.sql` | §4.2 |
| Lectura | `src/lib/pet/get-burrow.ts` | `getBurrowPets(supabase)`: `rpc("get_burrow_pets")`, guarda de forma en runtime fila a fila como hace `get-companion-state.ts` (no depende de regenerar tipos), devuelve `{ ok: true, rows, total }` o `{ ok: false }` |
| Reparto puro | `src/lib/pet/burrow.ts` | `arrangeBurrow(own, rows, visibleMax = 12)` → `{ own, visible, hidden, total }`; tipos `BurrowRow` y `BurrowNeighbor`. Sin Supabase, sin fechas |
| Escena | `src/components/pet/burrow.tsx` | Componente de cliente: props `own`, `neighbors`, `total`, `followingCount`; estado local `selected` y `expanded`; renderiza escena, tarjeta, «Ver las N» y estados vacíos |
| Sección servidor | `src/components/pet/burrow-section.tsx` | Componente async: `getBurrowPets` + `getFollowCounts` (`src/lib/social/follows.ts`), y pinta `<Burrow>`; sin `use cache` (depende de quién mira, regla #437) |
| Composición | `src/app/mascota/page.tsx` y `src/components/pet/pet-detail.tsx` | `PetDetail` acepta un `burrow?: ReactNode` que pinta entre la ficha y «Qué la sube»; la página pasa `<Suspense fallback={esqueleto}><BurrowSection own={…} /></Suspense>` |
| Copys | `messages/es.json`, `messages/en.json` | §3.5 |

Notas:

- La propia mascota entra en la escena por props (`name`, `class`, `stage` del snapshot), no por el
  RPC: el RPC la excluye.
- `PetSprite` exige `mood`: las vecinas van siempre con `neutral` (fila `idle`), sin `reaction`.
- El avatar del dueño usa el componente de avatar existente con su fallback de iniciales.
- Nada se lee desde el cliente: la escena llega renderizada; `selected` y `expanded` son estado
  local sin persistencia.
- Los sprites ajenos cargan sus sheets por la misma URL con hash que los propios; la caja táctil de
  cada botón es la del personaje (#1074), no la celda.

## 6. Errores y casos límite

- **RPC falla o devuelve una forma inesperada:** `getBurrowPets` devuelve `{ ok: false }` (las
  filas que no pasan la guarda se descartan una a una); `Burrow` pinta `burrow.error`. Nunca
  lanza: la ficha propia ya está en pantalla.
- **Vecina sin `username`** (no debería ocurrir, `profiles.username` es obligatorio): la fila se
  descarta en la guarda.
- **Seguimiento aceptado con bloqueo posterior:** el RPC la excluye por `users_are_blocked`, en
  los dos sentidos.
- **Perfil privado con seguimiento pendiente:** no aparece (`status <> 'accepted'`).
- **Etapa desconocida en `last_stage`:** `stageFor` solo escribe valores válidos; la guarda la
  descarta si no es una `PetStage`, como hace `get-companion-state.ts` (fail-closed).
- **Tu propia mascota es bellota:** sale como bellota, marcada como tuya.

## 7. Pruebas

- **Matriz SQL en dev** (con `set local role authenticated` y `request.jwt.claims.sub` = espectador),
  como las matrices de visibilidad de comentarios: seguido con perfil público → visible; privado con
  seguimiento aceptado → visible; privado con seguimiento pendiente → no; bloqueado en cualquier
  sentido → no; no seguido → no; propia → excluida; bellota → incluida; `total` cuenta antes del
  `limit`; `p_limit` se acota a `[1, 60]`; sin sesión → cero filas.
- **Vitest:** `src/lib/pet/burrow.test.ts` (propia primero, doce visibles, resto oculto, total,
  orden respetado tal cual llega); `src/lib/pet/get-burrow.test.ts` (guarda: fila válida pasa,
  fila con etapa inválida o sin `username` se descarta, error del RPC → `ok: false`);
  `src/components/pet/burrow.test.tsx` (propia con distintivo; tocar → tarjeta con enlace a
  `/u/<username>`; tocar de nuevo → cierra; «Ver las N» despliega; los dos estados vacíos;
  `aria-label` de cada botón; `burrow.error`).
- **e2e en `e2e/mascota.spec.ts`**, con dos usuarios (patrón `createUser` + `login` de
  `e2e/avisos-por-persona.spec.ts`): A y B eclosionan; A sigue a B; en `/mascota` de A aparece el
  botón con el nombre de la mascota de B; al tocarlo, la tarjeta enlaza a `/u/<B>`. Recordar que
  el `webServer` automático de Playwright puede agotar el tiempo (#1073): arrancar `npm run dev`
  aparte.
- **Verificación con personas:** dos cuentas reales de producción se siguen y se ven mutuamente.

## 8. Doc y seguimiento al cerrar

1. `docs/requirements/data-model.md`: nueva subsección 8bis.5 con las dos funciones, sus grants y
   la verificación en dev y prod con fecha.
2. `docs/requirements/backlog.md`: marcar la casilla S1. `docs/requirements/decisiones.md`: entrada
   de cierre solo si hubo una decisión nueva durante la implementación.
3. Parte II del documento de diseño: S1 hecho; S2 y S3 siguen como dirección hasta que se
   programen (issue propia al arrancar cada una).
4. Cualquier cosa descubierta de refilón → issue con sus tres etiquetas.

## 9. Límites asumidos

- La etapa ajena es `last_stage`, lo que guardó la última visita del dueño a `/mascota` (#1020):
  una vecina recién evolucionada puede salir con la etapa anterior hasta que su dueño abra la
  página. Es el mismo límite que ya tiene la compañera flotante.
- Ocultar la compañera flotante no te saca de la madriguera de los demás: son intenciones
  distintas. Quien quiera una mascota invisible tiene hoy el perfil privado; un interruptor propio
  se añade si alguien lo pide.
- Tope de sesenta vecinas en el RPC.
- Sin caché en ningún nivel: el resultado depende del espectador.
