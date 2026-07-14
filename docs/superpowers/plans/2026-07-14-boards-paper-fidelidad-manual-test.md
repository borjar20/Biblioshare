# Checklist manual — fidelidad Paper de los boards por tipo de actividad

Pasada de fidelidad contra `Paper - Clubes.html` (frames 4, 5, 7 y 8 del handoff).
Revisar en móvil (o viewport estrecho) y en escritorio, **en claro y en oscuro**.

## Preparación

- [ ] Un club con las 4 actividades activas: lectura conjunta (con hitos), tierlist, reto de lista (con ≥ 6 ítems) y reto genérico (uno cooperativo y, si se puede, otro competitivo).
- [ ] Al menos 2 participantes por actividad (uno sin avatar subido, para ver el fallback de iniciales).

## Lectura conjunta (hitos) — frame 4

- [ ] Card "Tu progreso" (solo participantes): portada del ítem, posición del diario (pág/episodio) si existe, "Hito n de N confirmado" y barra fina terracota.
- [ ] Eyebrow mono "HITOS"; cada hito es una card con dot circular: confirmado → relleno terracota con ✓; no confirmado → aro gris.
- [ ] Meta en mono: posición · "alcanzado por N" · fecha corta si tiene (`18 jul` — comprobar que el día no baila por zona horaria).
- [ ] Hito confirmado: etiqueta mono verde "Chat abierto" y chat embebido sobre fondo atenuado con rótulo verde "CHAT DE {hito} · HASTA {posición}".
- [ ] Hito alcanzable ("ya podrías confirmarlo"): botón compacto "Ya llegué aquí"; al confirmarlo la card pasa a estado confirmado y se abre su chat.
- [ ] Hito bloqueado: candado a la derecha, título atenuado y banda rayada "El chat se abre cuando…". **Sin botón** (antes se mostraba y fallaba con error).
- [ ] Miembro NO participante: sigue viendo la lista de hitos (decisión 7), sin card "Tu progreso".
- [ ] Moderador: el gestor de hitos (alta/edición/reorden) funciona igual que antes.

## Tierlist — frame 7

- [ ] Chips de participante con mini-avatar (20px); "La mía" primero; cambiar de chip cambia el tablero y el eyebrow ("Tu tierlist" / "Tierlist de {nombre}").
- [ ] Filas de tier: contenedor único con la letra serif grande en columna de color a la izquierda (texto legible sobre el color en claro Y oscuro — var(--tier-foreground)).
- [ ] Tier sin color configurado: etiqueta neutra, sin romper.
- [ ] Portadas 34×51 con sombra; seleccionada → ring terracota; arrastrando → semitransparente.
- [ ] **Drag & drop entre tiers sigue funcionando** (escritorio) y el hover del drop tinta la fila (borde terracota).
- [ ] **Vía táctil sigue funcionando**: tocar portada → elegir tier en la botonera de abajo; "Quitar" la devuelve al pool.
- [ ] Pool "SIN CLASIFICAR · N" con borde discontinuo y fondo atenuado; acepta drops.
- [ ] Tablero ajeno: solo lectura (ni drag ni selección).

## Reto de lista — frame 5

- [ ] Card de avance: anillo cónico terracota con tu número dentro, "Tu avance · n/N" serif y "Vas Xº de Y en el club" (solo si hay >1 participante).
- [ ] "LA LISTA": rejilla 5 columnas de portadas; completadas → overlay verde con ✓; pendientes → atenuadas. Cada portada enlaza a su ficha.
- [ ] "CLASIFICACIÓN DEL CLUB": filas con avatar (30px), nombre (el viewer sale como "Tú"), barra corta terracota y contador mono n/N; ordenadas por completados.
- [ ] "DETALLE POR MIEMBRO" plegado por defecto; al abrirlo aparece la matriz ítems × participantes de siempre (scroll horizontal contenido, sin ensanchar la página) y el chevron rota.
- [ ] La línea de regla del reto sigue al pie.

## Reto genérico — frame 8

- [ ] Chip de modo estático verde ("COOPERATIVO · META COMÚN" / "COMPETITIVO · CLASIFICACIÓN") — es config, no toggle (desviación consciente del mockup).
- [ ] Cooperativo: anillo verde con el total del club dentro, "El club va por X / Y" y subline "Meta común · quedan N días · tú aportas n" (con fecha de fin pasada → "termina hoy", nunca días negativos).
- [ ] Competitivo: anillo con TU avance, subline "Vas Xº de Y · quedan N días"; filas con número de posición.
- [ ] "QUIÉN APORTA" (coop) / "CLASIFICACIÓN" (comp): filas member-rank con fill VERDE; contador solo-número en coop, n/N en comp.
- [ ] La línea de regla del reto sigue al pie.

## Transversal

- [ ] Modo oscuro: checks sobre overlay verde legibles, etiqueta de tier legible, banda rayada del hito bloqueado visible, anillos con track atenuado.
- [ ] Participante sin avatar: iniciales serif sobre degradado en chips, filas y stacks.
- [ ] Recargar cada pantalla: sin errores de hidratación en consola.
- [ ] Unirse/salir de la actividad refresca el board correspondiente.

## Desviaciones conscientes respecto al mockup

- Sin botón "Compartir la mía" en tierlist: no existe la acción de compartir al feed (candidata a futuro).
- Sin "nota media que das" en el reto de lista: no hay dato agregado de valoraciones.
- El conmutador Colaborativo/Competitivo del mockup es aquí un chip estático: el modo es configuración congelada de la actividad.
