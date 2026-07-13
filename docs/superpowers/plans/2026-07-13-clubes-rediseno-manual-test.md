# Checklist manual — Rediseño de clubes (Paper)

Primera de tres partes del rediseño de clubes:

1. **Esta**: las pantallas — pestañas, tipos de actividad, agrupación, resumen,
   contador de miembros.
2. Siguiente: el asistente de **Proponer actividad**.
3. Después: **novedades** por club y **solicitudes de entrada**.

## Preparación

`npm run dev`, login con `devtest`. Ya eres owner de dos clubes de prueba.

**Ojo con los datos de prueba**: el club llamado *"Test Public Club"* está en
realidad marcado como **privado** en la base. Por eso sale con candado y por eso
"Descubrir" aparece vacío. No es un bug de la UI — es el dato.

## 1. Lista de clubes (`/clubes`)

- [ ] Cada tarjeta muestra el **número de miembros** ("2 miembros"). Esto es
      nuevo, y tiene truco: la RLS **no deja leer `club_members` si no eres
      miembro**, así que un club de "Descubrir" no podía decir cuánta gente
      tiene. Sale de una vista nueva (`club_stats`) que solo expone el
      **recuento**, nunca quiénes.
- [ ] Los clubes privados llevan **candado** junto al nombre.
- [ ] El nombre va en Fraunces y el marcador del club, en verde.

## 2. El club ahora tiene pestañas

Antes `/club/[slug]` era **un scroll único** con la cabecera, la gestión, las
actividades y el feed apilados. Ahora son tres pestañas.

- [ ] Entra en un club: hay **Feed · Actividades · Gestión**.
- [ ] **Gestión solo la ves si eres moderador o dueño.**
- [ ] **Prueba de seguridad**: siendo miembro raso (no moderador), escribe a mano
      `…?tab=gestion`. **No debe enseñarte la gestión** — cae en el Feed.
- [ ] La pestaña **Actividades lleva un aviso** con el número de propuestas
      esperando moderación (solo si puedes moderar).
- [ ] Las pestañas sincronizan con la URL (`?tab=`), así que se puede compartir
      el enlace y recargar sin perder la pestaña.

## 3. Feed: resumen de lo que hay en marcha

- [ ] Arriba del feed, antes de la conversación, hay un bloque con las
      **Actividades activas** (icono, título, tipo y participantes).
- [ ] Si hay hitos con fecha, aparece **Próximos hitos**, con el día y el mes en
      una cajita y el hito al lado.
- [ ] Si no hay ni actividades activas ni hitos próximos, **el bloque no
      aparece** (no debe salir una caja vacía).

### Para ver "Próximos hitos" tienes que crear uno

Los hitos **no tenían fecha** hasta ahora (solo etiqueta y posición: "pág. 320").
Se ha añadido una fecha opcional.

- [ ] Abre una actividad de **lectura conjunta** activa → gestor de hitos.
- [ ] Al crear o editar un hito hay un campo **"Fecha (opcional)"**.
- [ ] Ponle una fecha **futura** y vuelve al Feed del club: el hito debe salir en
      **Próximos hitos**.
- [ ] Ponle una fecha **pasada**: **no** debe salir (solo mira hacia delante).
- [ ] Deja la fecha vacía: sigue funcionando (una lectura a ritmo libre es
      válida y no aparece en el calendario).

## 4. Actividades: agrupadas y con identidad

- [ ] Cada tipo tiene ahora **su icono y su color**, y ya no son cuatro tarjetas
      idénticas: lectura (terracota), tierlist (oro), reto de lista (teal), reto
      genérico (verde).
- [ ] La lista está **agrupada por estado**: *Activas · N*, *Propuestas · esperan
      moderación*, *Finalizadas*. Los grupos vacíos no se pintan.
- [ ] Siendo moderador, las propuestas traen **Aprobar** y **Rechazar** en la
      propia tarjeta (antes había que entrar en la actividad para activarla).
- [ ] **Aprobar** la pasa a Activa. **Rechazar** la archiva — **no la borra**:
      queda el rastro de que se propuso y se descartó, y aparece en Finalizadas.
- [ ] Siendo miembro raso, ves las propuestas pero **sin botones**.

## 5. Gestión

- [ ] Muestra primero las **propuestas abiertas** (con aprobar/rechazar) y debajo
      los **miembros con sus roles**.
- [ ] Aprobar desde Gestión y aprobar desde Actividades hacen lo mismo (es el
      mismo componente, no dos copias).
- [ ] Invitar, hacer moderador, transferir propiedad y expulsar siguen
      funcionando.

## Lo que NO entra en esta parte

- **"3 novedades"** en la tarjeta de club → necesita saber qué has leído ya en
  cada club. Va en la parte 3.
- **Solicitudes de entrada** a clubes privados → hoy solo se entra por
  invitación, y la RLS lo niega explícitamente. Va en la parte 3.
- El **asistente de Proponer actividad** (dos pasos, editor de hitos con fechas,
  niveles de tierlist con color). Va en la parte 2.

## Verificación automática ya hecha

- `npm run build` pasa. **`npx playwright test`: 4/4**.
- Conduje el navegador con sesión real: las tres pestañas responden, el aviso de
  propuestas pendientes sale, la agrupación por estado se pinta y los botones de
  Aprobar/Rechazar están donde deben.
- **Migraciones aplicadas SOLO a dev** (`tyvzpuhxfwxrnkcpzxyg`), vía Management
  API, porque el MCP de Supabase apunta a **producción**. Quedan por aplicar a
  prod: `20260713_checkpoint_due_on.sql` y `20260713_club_stats.sql`.

### Aviso: dev y prod han divergido

Al regenerar los tipos desde dev salió que `reorder_queue.target_queue` es
**nullable en prod y no en dev**. El código sí pasa `null` (es la cola "Sin
cola"), así que **no** metí los tipos de dev a lo bruto: dejé la definición de
prod y solo añadí lo mío. El diff de `database.types.ts` es puramente aditivo.
Pero conviene averiguar por qué difieren.

### Flake conocido (previo)

Con el server en frío, el login de los e2e puede pasarse del timeout de 30 s
mientras Next compila. En caliente pasan 4/4. No es de este cambio.
