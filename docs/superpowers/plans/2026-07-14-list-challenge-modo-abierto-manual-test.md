# Checklist manual — Modalidad sin revisionado del reto por lista (H3b)

El reto por lista solo contaba un ítem si registrabas un **pase de diario terminado dentro de
la ventana del reto**. Quien ya tenía media lista leída debía revisionarla. Ahora cada reto
declara **cómo cuenta un ítem**:

- **Solo durante el reto** (`window`, por defecto — el comportamiento de siempre).
- **También lo que ya leíste** (`any`) — basta con tenerlo en tu biblioteca como *completado*.

## Preparación

`npm run dev`, login con `devtest`. Necesita la migración
`20260716_list_challenge_completion_mode.sql`, **ya aplicada en dev**.

Deja preparado, antes de empezar: **un libro (o peli) marcado como completado en tu biblioteca
hace tiempo**, con su pase de diario terminado en una fecha **anterior** a la que pondrás como
inicio del reto. Es la pieza que distingue las dos modalidades. Llamémoslo el *ítem viejo*.

## 1. Elegir la modalidad al proponer

- [ ] Club → **Actividades** → **Proponer actividad** → tipo **Reto por lista**. En el paso 2
      aparece un selector nuevo, **"Cómo cuenta un ítem"**, con las dos opciones.
- [ ] Por defecto sale **"Solo durante el reto"**.
- [ ] Al cambiar de opción, la frase de ayuda de debajo cambia: la de `any` dice que cuenta lo
      que ya tengas completado y que *nadie tiene que revisionar nada*.
- [ ] Los otros tres tipos de actividad (lectura conjunta, tierlist, reto por criterio) **no**
      muestran este selector.

## 2. La modalidad abierta cuenta tu historial

- [ ] Propón un reto por lista con **"También lo que ya leíste"**, fechas que empiecen **hoy**,
      y mete el *ítem viejo* en la lista. Actívalo y únete.
- [ ] En el tablero, el *ítem viejo* aparece **tickado sin haber registrado nada**.
- [ ] El anillo de avance y tu fila de la clasificación lo cuentan.
- [ ] El pie del tablero dice: *"Cuenta cualquier ítem que tengas completado en tu biblioteca,
      también si lo terminaste antes del reto."*
- [ ] En **Detalle por miembro** (la matriz plegada), la celda sale marcada. **No muestra
      fecha** — es correcto: no hay pase dentro de la ventana del que sacarla.

## 3. La modalidad por defecto sigue exigiendo pase

- [ ] Propón otro reto por lista, esta vez con **"Solo durante el reto"**, con el mismo *ítem
      viejo* en la lista. Actívalo y únete.
- [ ] El *ítem viejo* aparece **sin tickar**, aunque lo tengas completado en tu biblioteca.
- [ ] Registra un pase terminado **dentro de las fechas del reto** → pasa a tickado, y la celda
      de la matriz **sí** muestra la fecha.
- [ ] El pie del tablero muestra la frase de siempre, con las dos fechas de la ventana.

## 4. Cambiar la modalidad con el reto en marcha

- [ ] En el reto del punto 3 (ya **activo**), entra como **moderador** → **Modificar
      actividad**. Debajo de la lista de ítems aparece el selector de modalidad, con la opción
      actual marcada.
- [ ] Cámbialo a **"También lo que ya leíste"** → sale una **confirmación** avisando de que el
      progreso de todos los participantes se recalcula.
- [ ] **Cancela** → el selector se queda como estaba y nada cambia.
- [ ] Vuelve a cambiarlo y **acepta** → al volver al tablero, la rejilla, el anillo y la
      clasificación se han recalculado, y el pie del tablero ahora muestra la frase abierta.
- [ ] Con el reto en **propuesta** (no activo), cambiar la modalidad **no** pide confirmación:
      no hay progreso que mover.

## 5. Permisos

- [ ] Un miembro que **no** es creador ni moderador no ve el selector (de hecho no tiene acceso
      al panel de edición de un reto por lista, cuya curación es de curadores).

## 6. Retrocompatibilidad

- [ ] Un reto por lista **creado antes de este cambio** (sin `completionMode` en su config)
      sigue comportándose como **"Solo durante el reto"**: mismo tablero, mismo pie con las
      fechas. Nada de su progreso cambia.
