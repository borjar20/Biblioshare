# EPIC-05 Bloque H2: Tierlist de club — Manual Test Checklist

**Date:** 2026-07-13
**Scope:** Tiers en el composer y congelados al activar, curación del pool solo por creador+moderador, colocar arrastrando y con botones (táctil), ver la tierlist de otro en solo lectura, y las regresiones de H3 y Q8.
**Test Setup:** Un club con **A** (owner/moderador), **R** (miembro raso, propondrá la tierlist) y **P** (otro miembro).

---

## Setup

- [ ] **Paso 1: Entorno**
  - [ ] `npm run dev`
  - [ ] Confirmar que A, R y P son miembros activos del mismo club
  - [ ] Tener en la biblioteca de R al menos 4 ítems (harán de pool)

---

## Proponer y configurar

- [ ] **Paso 2: El campo de tiers aparece solo en este tipo**
  - [ ] Como **R**: "Proponer actividad"
  - [ ] Elegir **"Reto por criterio"** → ✅ aparecen los campos del criterio (modo, meta…)
  - [ ] Cambiar a **"Tierlist"** → ✅ aparece el campo **Tiers**, con `S, A, B, C, D` por defecto
  - [ ] Cambiar a **"Lectura conjunta"** → ✅ no aparece ningún campo de config

- [ ] **Paso 3: Proponer con tiers propios**
  - [ ] Con tipo "Tierlist", cambiar los tiers a otra escala, p.ej. `Top, Bien, Meh`
  - [ ] Poner título y proponer → ✅ aparece en la lista con estado "Propuesta"

---

## Curar el pool

- [ ] **Paso 4: R cura su pool estando aún en "Propuesta"**
  - [ ] Como **R**, abrir la tierlist (sigue en "Propuesta", nadie la ha activado)
  - [ ] Añadir 4 ítems al pool
  - [ ] ✅ Debe funcionar. *(Antes del Bloque H3 esto era imposible: la RLS exigía ser participante, y solo se puede uno unir a una actividad ya activa.)*

- [ ] **Paso 5: Un participante raso NO cura el pool**
  - [ ] Como **A**, activar la tierlist
  - [ ] Como **P**, abrir la tierlist y unirse
  - [ ] ✅ **NO** aparece el botón "Añadir ítem"
  - [ ] ✅ Sí aparece el texto de que solo el creador y los moderadores cambian la lista
  - [ ] ✅ **NO** aparece "Quitar" en los ítems que metió R

- [ ] **Paso 6: Los tiers quedan congelados al activar**
  - [ ] ✅ Con la tierlist ya activa, no hay forma de cambiar los tiers (el criterio se fija al proponer)

---

## Colocar

- [ ] **Paso 7: Arrastrando (escritorio)**
  - [ ] Como **P** (participante), en el tablero: arrastrar una portada de la bandeja (`—`) a un tier
  - [ ] ✅ La portada se mueve a esa fila
  - [ ] Arrastrar esa misma portada de un tier a otro → ✅ se mueve
  - [ ] **Recargar la página** → ✅ las colocaciones **persisten**

- [ ] **Paso 8: ⚠️ Con botones (viewport estrecho / táctil)**
  - [ ] Abrir DevTools y poner un **viewport de móvil**
  - [ ] Tocar una portada de la bandeja → ✅ queda **marcada** (borde de acento)
  - [ ] ✅ Abajo aparece "Elige el tier:" con un botón por tier
  - [ ] Pulsar un tier → ✅ la portada se coloca en esa fila
  - [ ] ✅ La página **no** se rompe ni scrollea de forma rara

- [ ] **Paso 9: Quitar**
  - [ ] Seleccionar una portada ya colocada y pulsar **"Quitar"**
  - [ ] ✅ Vuelve a la bandeja
  - [ ] Recargar → ✅ sigue en la bandeja

---

## Ver la de otro

- [ ] **Paso 10: Las tierlists ajenas son de solo lectura**
  - [ ] Que **P** y **R** (u otra cuenta participante) coloquen cosas distintas
  - [ ] Como **P**, pulsar la ficha del **otro participante** en el conmutador
  - [ ] ✅ Se ve **su** tierlist, con sus colocaciones
  - [ ] ✅ **No** se puede arrastrar nada
  - [ ] ✅ **No** aparecen los botones de tier abajo (no es tuya, no la editas)
  - [ ] Volver a "La mía" → ✅ vuelve a ser editable

- [ ] **Paso 11: Opiniones (viene gratis de Bloque G)**
  - [ ] ✅ Bajo el tablero sigue apareciendo la sección de **Opiniones** por ítem — es la superficie de debate
  - [ ] Añadir valoración + comentario a un ítem → ✅ se guarda y lo ven los demás participantes

---

## Regresiones

- [ ] **Paso 12: Q8 — la tierlist NO toca tu biblioteca**
  - [ ] Como una cuenta que **no** tenga en su biblioteca los ítems del pool: unirse a la tierlist
  - [ ] Ir a **tu biblioteca**
  - [ ] ✅ **No** se ha añadido nada. *(La tierlist está excluida del auto-añadir: ordenar cosas que ya conoces no es una lista de pendientes.)*

- [ ] **Paso 13: H3 — el reto por lista sigue igual**
  - [ ] Abrir un **reto por lista** existente (o crear uno)
  - [ ] ✅ Su creador sigue pudiendo curar la lista en "Propuesta"
  - [ ] ✅ Un participante raso sigue sin poder añadir ítems
  - [ ] ✅ La rejilla de progreso sigue funcionando

- [ ] **Paso 14: Lectura conjunta — un participante sí añade su ítem**
  - [ ] En una **lectura conjunta** (buddy_read), un participante raso ✅ **sí** puede añadir el ítem (el gate de curadores es solo para tierlist y reto por lista)

---

## Consola y limpieza

- [ ] **Paso 15: Sin errores**
  - [ ] Con DevTools abierto en todos los pasos: ✅ sin errores de consola ni 4xx/5xx inesperados
  - [ ] ✅ Sin avisos de hidratación al cargar el tablero *(el `DndContext` lleva id fijo justamente por eso)*

- [ ] **Paso 16: Limpieza**
  ```sql
  delete from public.club_activity_placements
   where activity_id in (select id from public.club_activities where club_id = '<club-id>' and kind = 'tierlist');
  delete from public.club_activity_items
   where activity_id in (select id from public.club_activities where club_id = '<club-id>' and kind = 'tierlist');
  delete from public.club_activity_participants
   where activity_id in (select id from public.club_activities where club_id = '<club-id>' and kind = 'tierlist');
  delete from public.club_activities where club_id = '<club-id>' and kind = 'tierlist';
  ```

---

## Resumen

- [ ] 1. Entorno
- [ ] 2. El campo de tiers aparece solo en este tipo
- [ ] 3. Proponer con tiers propios
- [ ] 4. R cura su pool aún en "Propuesta"
- [ ] 5. Un participante raso no cura el pool
- [ ] 6. Los tiers quedan congelados al activar
- [ ] 7. Colocar arrastrando (persiste al recargar)
- [ ] 8. ⚠️ Colocar con botones en viewport estrecho
- [ ] 9. Quitar devuelve el ítem a la bandeja
- [ ] 10. La tierlist de otro se ve en solo lectura
- [ ] 11. Las opiniones por ítem siguen ahí
- [ ] 12. Regresión Q8: la tierlist no toca tu biblioteca
- [ ] 13. Regresión H3: el reto por lista sigue igual
- [ ] 14. La lectura conjunta sigue dejando añadir a participantes
- [ ] 15. Sin errores de consola ni avisos de hidratación
- [ ] 16. Limpieza

---

**Tester:** _________________
**Fecha:** _________________
**Notas:** _____________________________________________________________________
