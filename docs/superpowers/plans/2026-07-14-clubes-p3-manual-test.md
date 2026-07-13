# Checklist manual — Clubes parte 3: solicitudes y novedades

Última parte del rediseño de clubes. (P1: las pantallas. P2: el asistente de
Proponer actividad. Ambas ya en `main`.)

## Preparación

`npm run dev`. Necesitas **dos usuarios**: `devtest` (dueño de
*Test Private Club*) y otro cualquiera.

⚠️ **Migraciones necesarias, aplicadas en dev, PENDIENTES en prod**:
`20260714_club_requested_enum`, `20260714_club_join_requests`,
`20260714_club_is_private_helper`.

## 1. Un club privado ya no da 404

Antes, quien no era miembro de un club privado recibía un **404**: no podía ni
comprobar que existía, así que tampoco pedir entrar. Ahora es **visible pero no
legible** — el mismo modelo que ya usa la app para los perfiles privados.

Con el **segundo usuario** (no miembro):

- [ ] Abre `/club/test-private-club`. Ves el **nombre y la descripción** del
      club, con un candado.
- [ ] **No ves nada del interior**: ni pestaña Feed, ni Actividades, ni Gestión,
      ni posts, ni miembros.
- [ ] Hay un botón **"Solicitar unirse"**.

## 2. Solicitar, y esperar

- [ ] Pulsa "Solicitar unirse" → pasa a **"Solicitud enviada"**.
- [ ] **Recarga la página**: sigues **sin ver el interior**. Una solicitud
      pendiente **no es membresía** y no da acceso a nada.
- [ ] Pulsa otra vez para **retirar** la solicitud: vuelve a "Solicitar unirse".
- [ ] En `/clubes`, un club privado que aparezca en la lista ofrece
      **"Solicitar unirse"**, no "Unirse".

## 3. El moderador la resuelve

Con **`devtest`** (dueño):

- [ ] En el club → pestaña **Gestión**, aparece **"Solicitudes de entrada · N"**
      con el avatar, el nombre y **Aceptar / Rechazar**.
- [ ] Los solicitantes **NO aparecen en la lista de miembros** (su sitio es este
      bloque, no el roster).
- [ ] **Aceptar** → la solicitud desaparece y esa persona pasa a ser miembro.
- [ ] Vuelve al segundo usuario: **ahora sí** ve el Feed, las Actividades y el
      contenido del club.
- [ ] **Rechazar** (pruébalo con otra solicitud) → desaparece, sin más. No se
      notifica el rechazo: avisar de un "no" a un club privado es más ruido que
      información.
- [ ] El solicitante recibe una **notificación** cuando le aceptan. Los
      moderadores reciben una cuando alguien solicita.

## 4. Novedades por club

- [ ] En `/clubes`, junto al número de miembros, cada club tuyo muestra
      **"N novedades"** en color de acento si hay actividad nueva.
- [ ] "Novedad" = post o actividad creados por **otra persona** **después** de tu
      última visita. **Lo tuyo propio no cuenta**: publica algo en un club y
      comprueba que no te aparece como novedad a ti.
- [ ] **Abre el feed del club** y vuelve a `/clubes`: el contador se ha puesto a
      cero.
- [ ] Mirar solo la pestaña **Gestión** o **Actividades** **no** marca como
      leído — ponerse al día es leer la conversación, no revisar la moderación.
- [ ] Al **entrar en un club antiguo** no deben salir cientos de novedades: sin
      registro de lectura, se cuenta desde que te uniste, no desde el principio
      de los tiempos.

## Los dos errores de RLS que salieron por el camino

Los cuento porque explican la forma de la solución.

**La solicitud era imposible.** La política decía "puedes solicitar si el club es
privado", y para comprobarlo consultaba `clubs`… pero la RLS de `clubs`
**no deja a un no-miembro ver un club privado**. La condición daba siempre falso
y **el insert se denegaba siempre** — justo en el único caso para el que existía.
Se resolvió con un helper `SECURITY DEFINER` (`club_is_private`), que es la misma
solución que el modelo original ya había necesitado para `club_member_row_exists`.

**El aviso a los moderadores se perdía en silencio.** Para notificarles hay que
saber quiénes son, y el roster solo lo puede leer un miembro. Quien solicita, por
definición, no lo es: el fan-out leía **cero filas** y no fallaba. Ahora va por
RPC (`notify_club_join_request`), que además comprueba que la solicitud exista y
sea tuya.

## Verificación automática ya hecha

- `npm run build` pasa. **`npx playwright test`: 6/6**.
- **e2e nuevo y permanente** (`club-join-request.spec.ts`) con **dos usuarios
  reales**: el forastero ve la identidad pero **no el interior**, solicita, sigue
  **sin acceso** tras recargar, el dueño aprueba desde Gestión, **se comprueba
  contra la base** que la membresía queda `active`/`member`, y el forastero ya ve
  el feed. Se autolimpia.
- Verificado que no queda residuo en la base tras la suite.
