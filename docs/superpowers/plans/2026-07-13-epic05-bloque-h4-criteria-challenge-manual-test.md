# EPIC-05 Bloque H4: Reto por criterio (`criteria_challenge`) — Manual Test Checklist

**Date:** 2026-07-13
**Scope:** Criterio en el composer (modo, tipo, meta, género, saga), congelado al activar, leaderboard competitivo, meta colectiva cooperativa, sin pool de ítems, y la visibilidad de los perfiles privados en el tablero.
**Test Setup:** Un club con **A** (owner/moderador), **R** (miembro raso, propondrá el reto) y **P** (otro miembro). Idealmente una cuarta cuenta **con perfil privado** para el paso 9.

---

## Setup

- [ ] **Paso 1: Entorno**
  - [ ] `npm run dev`
  - [ ] Confirmar que A, R y P son miembros activos del mismo club
  - [ ] Tener a mano en la biblioteca de P al menos **dos libros de terror** sin terminar (para registrar pases durante el reto)

---

## Proponer con criterio

- [ ] **Paso 2: Los campos del criterio aparecen solo en este tipo**
  - [ ] Como **R**, en el club: "Proponer actividad"
  - [ ] Elegir tipo **"Lectura conjunta"** → ✅ **no** aparecen campos de criterio
  - [ ] Cambiar a **"Reto por criterio"** → ✅ aparecen: modo, tipo, meta, género, saga
  - [ ] Volver a cambiar de tipo → ✅ los campos desaparecen (y el criterio se descarta)

- [ ] **Paso 3: Proponer el reto**
  - [ ] Con tipo "Reto por criterio": modo **Competitivo**, tipo **Libro**, meta **3**, género **terror**
  - [ ] Poner fechas de inicio (hace unos días) y fin (dentro de unos días)
  - [ ] Proponer → ✅ aparece en la lista con estado "Propuesta"

- [ ] **Paso 4: El buscador de sagas**
  - [ ] Proponer otro reto y, en el campo **Saga**, escribir el nombre de una saga que exista
  - [ ] ✅ Aparecen sugerencias; al elegir una, queda fijada con un botón para quitarla
  - [ ] (Este reto de saga se usará en el paso 11; si no hay ninguna saga en el catálogo, saltar ese paso)

---

## Congelado al activar

- [ ] **Paso 5: Editable mientras está en "Propuesta"**
  - [ ] *(Nota: la edición del criterio se hace por RPC; si la UI de edición del criterio no está expuesta, este paso se verifica en el paso 6 comprobando que **tras activar** ya no se puede.)*
  - [ ] Como **A** (moderador), activar el reto del paso 3 → ✅ pasa a "Activa"

- [ ] **Paso 6: Congelado tras activar**
  - [ ] ✅ Ni R (creador) ni A (moderador) pueden cambiar ya el criterio de un reto **activo**
  - [ ] *(Verificado en la batería RLS: la RPC lanza `config_frozen`. Aquí basta con confirmar que la UI no ofrece editarlo.)*

---

## Sin pool de ítems

- [ ] **Paso 7: La ficha no muestra "Ítems" ni "Opiniones"**
  - [ ] Abrir el reto por criterio
  - [ ] ✅ **No** aparece la sección "Ítems" (el reto se describe, no se enumera)
  - [ ] ✅ **No** aparece la sección "Opiniones" (sin ítems, no hay opinión por ítem)
  - [ ] **Regresión**: abrir un **reto por lista** (H3) o una **lectura conjunta** (H1) → ✅ esas secciones **sí** siguen apareciendo

---

## Progreso y leaderboard

- [ ] **Paso 8: Unirse y avanzar**
  - [ ] Como **P**, unirse al reto → ✅ aparece el tablero con la lista de participantes
  - [ ] ✅ El pie explica la regla: cuenta lo que termines entre las fechas, el progreso sale del diario
  - [ ] Registrar un **pase terminado** de un libro **de terror** con fecha **dentro** de la ventana
  - [ ] Volver al reto → ✅ tu contador sube (1/3) y tu barra avanza

- [ ] **Paso 9: ⚠️ El perfil privado se ve**
  - [ ] Con la cuenta de **perfil privado**: unirse al reto y registrar un pase que cuente
  - [ ] Como **P** (otra cuenta), abrir el tablero
  - [ ] ✅ La cuenta privada **aparece en el leaderboard con su progreso real** (no en 0)
  - [ ] *(Es el caso que una consulta normal perdería en silencio: la RPC `SECURITY DEFINER` es la política de lectura del tablero.)*

- [ ] **Paso 10: Lo que NO cuenta**
  - [ ] Registrar un pase de un libro de terror con fecha **anterior** al inicio del reto → ✅ **no** suma
  - [ ] Registrar un pase de un libro que **no** es de terror → ✅ **no** suma
  - [ ] Registrar un pase de una **película** de terror (el criterio pedía libro) → ✅ **no** suma

- [ ] **Paso 11: Filtro por saga**
  - [ ] Activar el reto de saga del paso 4, unirse, y terminar un ítem **de esa saga** dentro de la ventana → ✅ suma
  - [ ] Terminar un ítem que **no** es de esa saga → ✅ no suma

- [ ] **Paso 12: Ordenación**
  - [ ] Con al menos dos participantes con progresos distintos
  - [ ] ✅ El leaderboard sale ordenado de más a menos progreso, con posición (1, 2, …) y porcentaje
  - [ ] ✅ Tu propia fila aparece destacada

---

## Modo cooperativo

- [ ] **Paso 13: Meta colectiva**
  - [ ] Proponer y activar otro reto con modo **Cooperativo**, meta **5**, tipo **Cualquiera**
  - [ ] Que se unan **dos** cuentas y cada una termine **un** ítem dentro de la ventana
  - [ ] ✅ Arriba se ve **una sola barra colectiva**: "Entre todos: 2 de 5"
  - [ ] ✅ La lista de participantes **no** muestra posiciones (1, 2, …) ni porcentajes — no es un ranking

---

## Consola y limpieza

- [ ] **Paso 14: Sin errores**
  - [ ] Con DevTools abierto durante todos los pasos: ✅ sin errores de consola ni 4xx/5xx inesperados

- [ ] **Paso 15: Limpieza**
  - [ ] Borrar los retos de prueba:
    ```sql
    delete from public.club_activity_participants
     where activity_id in (select id from public.club_activities where club_id = '<club-id>' and kind = 'criteria_challenge');
    delete from public.club_activities where club_id = '<club-id>' and kind = 'criteria_challenge';
    ```
  - [ ] *(Los pases de diario que registraste son datos reales de tu biblioteca — bórralos solo si quieres.)*

---

## Resumen

- [ ] 1. Entorno
- [ ] 2. Los campos del criterio aparecen solo en este tipo
- [ ] 3. Proponer el reto con criterio
- [ ] 4. El buscador de sagas funciona
- [ ] 5. Activar
- [ ] 6. El criterio queda congelado tras activar
- [ ] 7. Sin "Ítems" ni "Opiniones" (y regresión: H1/H3 sí las tienen)
- [ ] 8. Unirse y avanzar registrando un pase
- [ ] 9. ⚠️ El perfil privado se ve en el leaderboard
- [ ] 10. Fuera de ventana / otro género / otro tipo → no cuentan
- [ ] 11. Filtro por saga
- [ ] 12. Ordenación del leaderboard
- [ ] 13. Modo cooperativo (barra colectiva, sin ranking)
- [ ] 14. Sin errores de consola
- [ ] 15. Limpieza

---

**Tester:** _________________
**Fecha:** _________________
**Notas:** _____________________________________________________________________
