# EPIC-05 Bloque H3: Reto por lista (`list_challenge`) — Manual Test Checklist

**Date:** 2026-07-13
**Scope:** Curación de la lista (creador + moderator+), Q8 (auto-añadir ítems a la biblioteca, sin pisar filas existentes), progreso derivado de pases de diario dentro de la ventana del reto, rejilla ítems × participantes, barras de avance, y la exclusión de `tierlist` del auto-añadir.
**Test Setup:** Un club con al menos tres cuentas: **A** = owner/moderador, **R** = miembro raso que **propone** el reto (no es moderador), **P** = otro miembro raso que participará. Idealmente una cuarta cuenta con **perfil privado** para el paso 12.

---

## Setup

- [ ] **Paso 1: Entorno**
  - [ ] `npm run dev`
  - [ ] Confirmar que A (owner), R y P son miembros activos del mismo club
  - [ ] Antes de empezar, anotar el estado de la biblioteca de P: elegir un libro que **P ya tenga como "completado"** (con valoración si es posible) — se usará en el paso 8, que es el invariante crítico

---

## Curación de la lista (incluye el bug de F1 que este bloque arregla)

- [ ] **Paso 2: R propone el reto y cura la lista ESTANDO AÚN EN "Propuesta"**
  - [ ] Entrar como **R** (miembro raso, no moderador)
  - [ ] En el club, "Proponer actividad" → tipo **"Reto por lista"**, poner título, y (recomendado) fechas de inicio y fin
  - [ ] Abrir la actividad recién creada — sigue en estado **"Propuesta"**
  - [ ] **Añadir 3 ítems a la lista sin que nadie la haya activado todavía**
  - [ ] ✅ Debe funcionar. *(Antes de este bloque era imposible: la RLS exigía ser participante, y solo se puede uno unir a una actividad ya activa — el creador no podía tocar su propia lista.)*

- [ ] **Paso 3: A (moderador) también puede curar**
  - [ ] Entrar como **A**, abrir la actividad
  - [ ] Añadir un 4º ítem → ✅ debe funcionar
  - [ ] Activar la actividad ("Activar")

- [ ] **Paso 4: Un participante raso NO puede tocar la lista**
  - [ ] Entrar como **P**, abrir la actividad, pulsar "Unirse"
  - [ ] ✅ **NO** debe verse el botón "Añadir ítem"
  - [ ] ✅ Debe verse el texto explicativo: *"Solo quien propuso el reto y los moderadores pueden cambiar la lista."*
  - [ ] ✅ **NO** debe verse "Quitar" en los ítems que añadieron R o A

- [ ] **Paso 5: R puede quitar un ítem que metió el moderador**
  - [ ] Entrar como **R**, quitar el 4º ítem (el que añadió A)
  - [ ] ✅ Debe funcionar (es *su* lista)
  - [ ] Volver a añadirlo (hará falta en el paso 9)

---

## Q8 — auto-añadir a la biblioteca

- [ ] **Paso 6: El aviso antes de unirse**
  - [ ] Con una cuenta que **no** se haya unido aún, abrir la actividad
  - [ ] ✅ Junto al botón "Unirse" debe leerse el aviso: los N ítems se añadirán a tu biblioteca como pendientes (los que ya tengas no se tocan) y tu progreso será visible para el resto de participantes

- [ ] **Paso 7: Unirse crea las filas `planned` que faltan**
  - [ ] Entrar como una cuenta nueva (o P si aún no se unió), pulsar "Unirse"
  - [ ] Ir a **tu biblioteca**
  - [ ] ✅ Los ítems de la lista que **no tenías** deben aparecer ahora como **"Pendiente"**

- [ ] **Paso 8: ⚠️ INVARIANTE CRÍTICO — un ítem que ya tenías NO se degrada**
  - [ ] Asegurarse de que la lista del reto **incluye** el libro que P ya tenía como **"completado"** (paso 1). Si no, que R lo añada a la lista.
  - [ ] Entrar como **P** y unirse al reto (si ya se unió, salir y volver a unirse)
  - [ ] Ir a la biblioteca de P y abrir ese libro
  - [ ] ✅ **Debe seguir en "Completado", con su valoración intacta.** NO debe haber pasado a "Pendiente"
  - [ ] ✅ El resto de ítems de la lista que P no tenía sí deben aparecer como "Pendiente"

- [ ] **Paso 9: Backfill — un ítem añadido a mitad de reto llega a las bibliotecas de todos**
  - [ ] Con P (y quien más) ya dentro del reto, entrar como **A** (moderador) y **añadir un ítem nuevo** a la lista
  - [ ] Entrar como **P** e ir a su biblioteca
  - [ ] ✅ El ítem nuevo debe aparecer como **"Pendiente"** en la biblioteca de P, aunque P no hizo nada
  - [ ] *(Esto es el caso cross-user: el moderador no puede escribir en la biblioteca de otro; lo hace un trigger `SECURITY DEFINER`.)*

- [ ] **Paso 10: Salir del reto NO borra nada de tu biblioteca**
  - [ ] Como **P**, pulsar "Salir" de la actividad
  - [ ] Ir a la biblioteca
  - [ ] ✅ Los ítems añadidos por el reto **siguen ahí** (puede que ya hubieras empezado alguno)
  - [ ] Volver a unirse (hará falta abajo)

- [ ] **Paso 11: Una TIERLIST no toca tu biblioteca**
  - [ ] Como **A**, crear y activar una actividad de tipo **"Tierlist"**, unirse y añadirle 2 ítems que **otra** cuenta (P) no tenga
  - [ ] Entrar como **P**, unirse a la tierlist
  - [ ] Ir a la biblioteca de P
  - [ ] ✅ **NO** debe haberse añadido nada — la tierlist está excluida del auto-añadir (ordenar cosas que ya conoces no es una lista de pendientes)

---

## Progreso — la regla del reto

- [ ] **Paso 12: La rejilla y las barras**
  - [ ] Como participante, abrir la actividad y bajar hasta "Progreso del reto"
  - [ ] ✅ Debe verse una **rejilla**: una fila por ítem de la lista, una columna por participante
  - [ ] ✅ Tu propia columna debe estar destacada y aparecer **la primera**
  - [ ] ✅ Dos barras: "Tu progreso: X de N" y "Progreso del club: X de N"
  - [ ] ✅ Bajo la rejilla, la regla: *"Un ítem se marca solo cuando registres un pase terminado entre {inicio} y {fin}. Si ya lo habías terminado antes, cuenta una relectura."*
  - [ ] Si hay una cuenta con **perfil privado** participando: ✅ su columna **debe verse igualmente** con su progreso real (unirse = consentir compartirlo dentro de la actividad)

- [ ] **Paso 13: Completar un ítem hace saltar la celda**
  - [ ] Como P, ir a la ficha de uno de los ítems de la lista (el título en la rejilla enlaza a ella)
  - [ ] Registrar un **pase terminado** con fecha **dentro de la ventana del reto**
  - [ ] Volver a la actividad
  - [ ] ✅ Tu celda de ese ítem debe mostrar ahora el **check**, y las barras subir
  - [ ] ✅ Al pasar el ratón sobre la celda debe verse "Completado el {fecha}"

- [ ] **Paso 14: Un pase ANTERIOR al reto no cuenta**
  - [ ] Registrar un pase terminado de otro ítem de la lista con fecha **anterior** a la de inicio del reto
  - [ ] Volver a la actividad
  - [ ] ✅ Esa celda debe seguir **pendiente** (leerse algo el año pasado no da tick gratis)

- [ ] **Paso 15: Una relectura SÍ cuenta y no muta tu biblioteca**
  - [ ] Con el libro que P tenía como "completado" desde antes (paso 8), registrar un **pase nuevo** con fecha **dentro** de la ventana
  - [ ] ✅ La celda debe pasar a completada
  - [ ] Ir a la biblioteca de P y abrir ese libro
  - [ ] ✅ Debe seguir en **"Completado"** con su valoración, y simplemente tener **un pase más** en su historial

---

## Opiniones (reutilizadas de Bloque G, sin código nuevo)

- [ ] **Paso 16: Opinión por ítem con lista multi-ítem**
  - [ ] Como participante, en la sección "Opiniones" de la actividad
  - [ ] ✅ Debe haber una sección **por cada ítem** de la lista
  - [ ] Añadir valoración + comentario a uno de ellos → ✅ se guarda y lo ven los demás participantes
  - [ ] Con una cuenta que sea **miembro del club pero NO participante** del reto: ✅ no ve las opiniones (solo el aviso de unirse)

---

## Móvil / accesibilidad

- [ ] **Paso 17: La rejilla scrollea sin romper la página**
  - [ ] Abrir la actividad en un viewport **estrecho** (DevTools, móvil)
  - [ ] ✅ La rejilla debe **scrollear en horizontal dentro de su propio contenedor**
  - [ ] ✅ La **página** NO debe scrollear en horizontal (nada se sale por la derecha)
  - [ ] ✅ La primera columna (portada + título del ítem) debe quedarse **fija** al scrollear la rejilla

---

## Consola

- [ ] **Paso 18: Sin errores**
  - [ ] Con DevTools abierto durante todos los pasos anteriores
  - [ ] ✅ Sin errores en consola, sin respuestas 4xx/5xx inesperadas en la pestaña Network

---

## Limpieza

- [ ] **Paso 19: Borrar los datos de prueba**
  - [ ] Identificar el id del club y de las actividades de prueba
  - [ ] En la BD de dev:
    ```sql
    delete from public.club_activity_opinions where activity_id in (select id from public.club_activities where club_id = '<club-id>');
    delete from public.club_activity_items where activity_id in (select id from public.club_activities where club_id = '<club-id>');
    delete from public.club_activity_participants where activity_id in (select id from public.club_activities where club_id = '<club-id>');
    delete from public.club_activities where club_id = '<club-id>';
    ```
  - [ ] Opcional: quitar de las bibliotecas de prueba los ítems `planned` que creó el reto
    *(ojo: el reto no los borra al salir — es deliberado, no destructivo)*

---

## Resumen

- [ ] 1. Entorno
- [ ] 2. R cura la lista con el reto aún en "Propuesta" (arregla el bug F1)
- [ ] 3. El moderador también cura; activar
- [ ] 4. Un participante raso NO puede tocar la lista
- [ ] 5. El creador puede quitar un ítem del moderador
- [ ] 6. Aviso antes de unirse
- [ ] 7. Unirse crea las filas `planned` que faltan
- [ ] 8. ⚠️ Un ítem ya "completado" NO se degrada
- [ ] 9. Backfill cross-user de un ítem añadido a mitad
- [ ] 10. Salir no borra nada de la biblioteca
- [ ] 11. La tierlist no toca la biblioteca
- [ ] 12. Rejilla + barras + perfil privado visible
- [ ] 13. Completar un ítem hace saltar la celda
- [ ] 14. Un pase anterior al reto no cuenta
- [ ] 15. Una relectura cuenta y no muta la biblioteca
- [ ] 16. Opiniones por ítem con lista multi-ítem
- [ ] 17. La rejilla scrollea sin romper la página
- [ ] 18. Sin errores de consola
- [ ] 19. Limpieza

---

**Tester:** _________________
**Fecha:** _________________
**Notas:** _____________________________________________________________________
