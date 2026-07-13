# Checklist manual — Asistente de Proponer actividad

Parte 2 de 3 del rediseño de clubes. (Parte 1: las pantallas, ya mergeada.
Parte 3: novedades por club y solicitudes de entrada.)

## Preparación

`npm run dev`, login con `devtest`. Entra en un club → pestaña **Actividades**.

⚠️ **Necesita la migración `20260713_propose_with_setup.sql`.** Está aplicada en
**dev**. Sin ella, el asistente crea la actividad pero **no puede añadirle ítems
ni hitos** (la RLS los rechaza) — ver la sección de abajo.

## 1. Paso 1: lo común y el tipo

- [ ] "Proponer actividad" abre un panel con **Título**, **Descripción** y cuatro
      **tarjetas de tipo** — cada una con su icono, su color y una frase de qué
      es. Antes era un `<select>` desplegable.
- [ ] La tarjeta elegida se tiñe con el color de su tipo.
- [ ] **Continuar** está deshabilitado hasta que hay título **y** tipo.

## 2. Paso 2: lo propio de cada tipo

### Lectura conjunta

- [ ] Sale el badge del tipo arriba.
- [ ] **Sin ítem elegido**, el editor de hitos dice *"Elige primero el ítem"* —
      y tiene razón: sin saber si es libro o serie no se puede pedir una posición
      (página vs. temporada/episodio).
- [ ] Elige un ítem: aparece su portada, con una X para quitarlo. **Solo admite
      uno** (el botón de añadir desaparece).
- [ ] Ahora el editor de hitos pide **nombre + página + fecha**. Con una serie,
      pide **temporada + episodio** en vez de página.
- [ ] Añade dos hitos, ponles fecha, y propón.
- [ ] **La actividad nace ya montada**: entra en ella y comprueba que tiene su
      ítem y sus hitos. Antes había que crearla vacía y añadírselo todo dentro.
- [ ] Los hitos con fecha futura salen en **Próximos hitos** del feed del club
      (una vez la actividad esté activa).

### Tierlist

- [ ] Los **niveles** ya no son un campo de texto con comas: son filas editables
      con **nombre y color**, reordenables con las flechas, y se pueden añadir y
      quitar.
- [ ] El cuadradito de color **cicla** por una paleta al pulsarlo (no hay
      selector libre: acabaría en niveles ilegibles sobre el fondo).
- [ ] Propón una tierlist con niveles de colores y comprueba que el **tablero**
      los pinta con su color.
- [ ] **Compatibilidad**: abre una tierlist creada ANTES de este cambio (sus
      niveles se guardaron como texto plano, sin color). **Debe seguir
      funcionando**, con los niveles en gris. Si dejara de renderizar, sus
      colocaciones quedarían inaccesibles.

### Reto de lista y reto por criterio

- [ ] Reto de lista: puedes añadir **varios ítems** al proponerlo.
- [ ] Reto por criterio: **no** tiene pool de ítems (el reto se describe por
      criterio, no se enumera), y mantiene su selector de modo
      colaborativo/competitivo.

## 3. Copy

- [ ] La UI ya no dice **"checkpoint"** en inglés: dice **"hito"**, como el resto
      de la app y como el diseño. Era el único sitio donde se había colado.
- [ ] El botón final dice **"Proponer actividad"** y debajo *"Se enviará a los
      moderadores para su aprobación."*

## El cambio de RLS, y por qué hizo falta

El diseño quiere proponer la actividad **ya montada**. La RLS lo impedía:

- **Ítems**: exigían ser *participante* de la actividad. Quien acaba de
  proponerla **no lo es** todavía.
- **Hitos**: exigían que la actividad estuviera **`active`** y que fueras
  **moderador**. Una propuesta nace en `proposed` → el insert se denegaba
  **siempre**.

La migración añade **una sola regla**: *mientras una actividad está `proposed`,
su autor puede añadirle ítems y hitos* — es su borrador, nadie se ha unido y
nadie tiene progreso.

**Lo que NO cambia, y conviene comprobarlo:**

- [ ] Una actividad **`active`** sigue siendo territorio de **moderator+**: un
      miembro raso **no puede** añadirle ni moverle hitos. Esa garantía existe
      para que a quien va por la mitad de una lectura no se le muevan los hitos
      bajo los pies.
- [ ] No puedes añadir ítems ni hitos a la propuesta **de otra persona**.

## Verificación automática ya hecha

- `npm run build` pasa. **`npx playwright test`: 5/5**.
- **e2e nuevo y permanente** (`e2e/propose-wizard.spec.ts`): recorre el asistente
  entero, propone una lectura con ítem e hito, **verifica contra la base de datos**
  que la actividad nació con 1 ítem y 1 hito en la posición `{page: 120}`, y
  **borra la actividad al terminar**.

### Aviso: mi primer test dio un falso verde

La primera versión comprobaba que el título apareciera en pantalla tras enviar.
**Pasaba, y no se creaba nada**: el asistente muestra el título en su propia
cabecera, así que el texto estaba ahí aunque el `submit` fallara en silencio (era
justo la RLS rechazando los inserts). Lo pillé al ir a mirar la base de datos.
Ahora el test comprueba la **tarjeta** de la actividad (un enlace a su ficha) y,
sobre todo, **consulta la base**.

### Pendiente

La migración `20260713_propose_with_setup.sql` está en **dev**, **no en prod**.
