# EPIC-05 Bloque C — Manual test checklist

Reemplaza el Task 8 del plan de implementación (verificación automática en
navegador) — la construcción automática de este checklist resultó frágil, así
que este documento es para ejecutarlo tú manualmente. Cubre también los dos
bugs que encontró la revisión final de rama completa y que ya están
corregidos en el commit `34f2b9a` (`fix: address EPIC-05 Bloque C
integrated-review findings`).

## 0. Arrancar el entorno

```bash
cd .claude/worktrees/epic05-bloque-b
npm run dev
```

Si el puerto 3000 ya está ocupado por otra cosa, usa `npm run dev -- -p 3005`
(o el puerto que prefieras) y ajusta las URLs de abajo en consecuencia.

Credenciales de `devtest` (usuario de prueba sembrado): están en `.env.local`
bajo `TEST_USER_EMAIL` / `TEST_USER_PASSWORD` / `TEST_USER_USERNAME`.

## 1. Preparar datos: `devtest` necesita seguir a alguien con actividad

Ahora mismo `devtest` no sigue a nadie en dev, así que la pestaña Siguiendo
estará vacía hasta que seas seguidor aceptado de alguna cuenta con actividad
variada. Dos formas de conseguirlo, tú decides cuál:

- **Vía UI (recomendado, más simple)**: crea una segunda cuenta de prueba
  desde `/signup` (p. ej. `tuemail+bibliosharetest2@gmail.com`), añade algo de
  actividad variada desde esa cuenta (ver lista abajo), y desde `devtest` ve a
  `/usuarios`, búscala y síguela. Si la cuenta es pública el seguimiento es
  automático; si la marcas privada, tendrás que aceptar la solicitud desde la
  otra cuenta.
- **Vía SQL** (si prefieres no crear una cuenta nueva a mano): usa el mismo
  patrón de Management API que se ha usado en sesiones anteriores contra el
  proyecto dev (`tyvzpuhxfwxrnkcpzxyg`) para insertar una fila en `follows`
  apuntando a cualquier cuenta ya existente con actividad. No lo he hecho yo
  en esta sesión a propósito, para no seguir generando trabajo automático de
  fondo tras tu petición de cambiar a testing manual.

**Actividad variada que conviene tener en la cuenta seguida**, para poder
marcar todos los puntos del checklist:
- Un ítem terminado sin rating ni reseña (verbo `finished`/"terminó")
- Un ítem con rating pero sin reseña (verbo `rated`/"valoró")
- Un ítem con reseña de texto (verbo `reviewed`/"reseñó") — este es el que
  necesitas para probar las reacciones/comentarios inline
- Una sesión de progreso registrada (verbo `progressed`/"avanzó en")
- Un ítem recién añadido a biblioteca (verbo `added`/"añadió a su biblioteca")
- (Opcional) Un episodio de serie marcado, con y sin reseña (verbo
  `watchedEpisode`/"marcó un episodio de", o `reviewed`/`rated` si tiene
  texto/nota)

## 2. Checklist funcional

Inicia sesión como `devtest` en `/login`.

- [ ] **2.1 — Pestaña por defecto**: al cargar `/`, aterrizas en el Panel
  (dashboard de estadísticas de siempre), sin `?tab=` en la URL.
- [ ] **2.2 — Cambiar a Siguiendo**: click en la pestaña "Siguiendo". La URL
  pasa a `?tab=following` y aparece el feed con actividad de la cuenta que
  sigues.
- [ ] **2.3 — Verbos correctos**: cada tarjeta muestra el verbo que le
  corresponde según los datos reales (terminó / valoró / reseñó / avanzó en /
  marcó un episodio de / añadió a su biblioteca) — confirma que un ítem con
  reseña de texto aparece como "reseñó" (no como "valoró" ni "terminó"), y
  que uno con solo rating aparece como "valoró".
- [ ] **2.4 — Reseña visible**: la tarjeta de un evento "reseñó" muestra el
  extracto de la reseña debajo del rating.

### 2.5 — Bug corregido: filtros (antes no actualizaban la lista)

- [ ] Con el feed cargado, haz click en el chip de tipo de ítem "Libros" (o
  "Películas"/"Series", el que tenga contenido). **Comprueba que la lista de
  eventos visible cambia de verdad** (no solo que el chip se resalta) —
  **sin recargar la página manualmente**. Antes de la corrección, el chip
  cambiaba de aspecto pero la lista se quedaba congelada con los eventos de
  antes del filtro hasta un F5.
- [ ] Vuelve a "Todo" y comprueba que la lista completa reaparece.
- [ ] Activa el toggle "Solo reseñas" — comprueba que solo quedan visibles
  los eventos con verbo "reseñó".

### 2.6 — Bug corregido: reacciones/comentarios inline (antes no se actualizaban)

- [ ] En la tarjeta de un evento "reseñó" (o cualquier evento con origen en
  una reseña o un episodio marcado), haz click en el botón de "me gusta".
  **Comprueba que el corazón se rellena y el contador sube inmediatamente,
  sin recargar la página.** Antes de la corrección, el like se guardaba en la
  base de datos (y disparaba la notificación al autor) pero la UI del feed no
  se enteraba hasta recargar.
- [ ] Click otra vez para quitar el like — comprueba que se vacía y el
  contador baja, también sin recargar.
- [ ] Expande el hilo de comentarios de esa misma tarjeta, escribe un
  comentario y envíalo — comprueba que aparece en la lista sin recargar.
- [ ] (Opcional pero recomendado) Repite el check de like/comentario en un
  evento que hayas traído a la vista con "Cargar más" (ver 2.7) — este caso
  **no** está cubierto por la corrección (limitación conocida, documentada en
  el commit de la corrección): es esperable que un like ahí **no** se
  refleje sin recargar. Si ves que tampoco se refleja, eso es lo esperado,
  no un bug nuevo.

### 2.7 — Paginación

- [ ] Si hay más de 20 eventos combinados, aparece el botón "Cargar más" al
  final de la lista. Haz click y comprueba que se añaden más eventos sin
  recargar la página completa.
- [ ] Cuando ya no queda más contenido, el botón "Cargar más" desaparece.

### 2.8 — Estado vacío

- [ ] Con una cuenta que no siga a nadie (o dejando de seguir temporalmente a
  todos desde `devtest`), la pestaña Siguiendo muestra el mensaje de estado
  vacío con un enlace funcional a `/usuarios`.

### 2.9 — Consola limpia

- [ ] Durante todo lo anterior, no aparecen errores en la consola del
  navegador (F12 → Console).

## 3. Limpieza

Si creaste una segunda cuenta de prueba o actividad adicional solo para este
checklist, bórrala al terminar (mismo criterio de siempre: no dejar datos de
prueba sueltos en dev). El estado de `devtest` (a quién sigue, `is_public`,
etc.) debería quedar como estaba antes de empezar, salvo que decidas dejarlo
siguiendo a la cuenta de prueba a propósito para verificaciones futuras.

## 4. Si algo falla

Si cualquier punto del checklist no se comporta como se describe, dime
exactamente cuál y qué viste en su lugar (y si hay algo en la consola del
navegador) — lo investigamos a partir de ahí en vez de asumir que la
corrección funcionó.
