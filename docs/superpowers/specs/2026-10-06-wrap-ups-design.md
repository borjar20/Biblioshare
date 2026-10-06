# Wrap-ups: tu semana, tu mes y tu año en stories

> [Histórico · congelado 2026-10-06] Spec de diseño. El estado vivo lo mandan el código y `decisiones.md`.

Cubre «Tu año en Biblioshare» (backlog §7.24) y lo amplía a semana y mes. El foco es lo visual:
una secuencia de **stories** a pantalla completa dentro de la app y, al final, una **imagen
9:16** para compartir fuera y un resumen publicable en el feed. Se decidió sobre maquetas
(editorial cálido, crónica pixel RPG, póster gráfico y dos mezclas de las dos últimas).

Los tres periodos entran en la **misma entrega**.

## 1. Decisiones de producto

| Tema | Decisión |
|---|---|
| Forma | Stories en la app + imagen para compartir al cerrar |
| Contenido | Imprescindible: lo consumido, hábitos, momentos. También: lo social. Fuera: BiblioPlay |
| Narradora | **Híbrido**: una ardilla narradora COMÚN con variantes por tipo de contenido; la ardilla PROPIA del usuario sale en portada y cierre (y en «evolución» del anual) |
| Aviso | Push + portada con anillo en la home |
| Persistencia | **Solo el último de cada tipo**: máximo 3 filas por usuario (semana, mes, año) |
| Feed | Lo **publica el usuario** a mano; los seguidores ven el **resumen**, no las stories |
| Poca actividad | Se genera igual, con menos stories y narradora «tranquila», **sin push ni aviso** |
| Estilo | **Póster pixel**: pósteres de color plano con cifras gigantes y acabado pixel en todo (rótulos pixel, bordes duros con sombra en escalera, portadas como cartas, ardilla como sticker). Sin escenas del campamento |

## 2. Periodos y ciclo de vida

Hora `Europe/Madrid`, como la ronda de clubes.

| Tipo | Se genera | Cubre | Rótulo |
|---|---|---|---|
| `week` | lunes 09:00 | semana ISO anterior (lunes–domingo) | «Semana del 29 sep al 5 oct» |
| `month` | día 1, 09:00 | mes natural anterior | «Septiembre 2026» |
| `year` | **26 de diciembre, 10:00** | 1 de enero – 25 de diciembre | «Tu 2026 · hasta el 25 de diciembre» |

El anual se adelanta a propósito para casar con las fechas en que se comparte; se pierden seis
días y el rótulo lo dice (principio 8 de `docs/design/paneles-estadisticos.md`).

Ciclo de una fila de `wrap_ups`:

1. **Generado** por el cron con `payload` e `intensity` (`full` | `quiet`).
2. **Aviso**: solo si `full`, push + portada con anillo en la home. Un `quiet` se ve desde
   `/estadisticas` sin anunciarse.
3. **Visto**: `seen_at`; el anillo se apaga.
4. **Actualizar** (mientras no esté publicado): recalcula el mismo periodo por si se registró
   algo atrasado. Máximo una vez cada 10 minutos.
5. **Publicado**: «Publicar en el feed» crea un post `wrap_up` con un resumen congelado; desde ahí
   no se recalcula.
6. **Sustituido**: el siguiente periodo del mismo tipo sobrescribe la fila y **borra el post**
   asociado.

Umbrales de `quiet`: semana con menos de 2 días con actividad; mes con menos de 4; el anual es
siempre `full` si hay alguna actividad en el año.

**Sin ninguna actividad en el periodo** no se genera nada y se **borra** la fila anterior de ese
tipo (y su post), para que un usuario inactivo no vea como «el último» uno de hace meses.

## 3. Catálogo de stories

Adaptativo: cada story tiene una regla de aparición y, si no tiene dato, **no sale** («la regla
que no se sostiene se calla», principio 6).

| # | Story | Sale si… | Semana | Mes | Año |
|---|---|---|---|---|---|
| 1 | **Portada** «Crónica de …» con la ardilla propia | siempre | ✓ | ✓ | ✓ |
| 2 | **Tu tiempo**: horas totales, desglose ● libros ■ películas ▲ series, variación frente al periodo anterior | hay actividad con duración | ✓ | ✓ | ✓ |
| 3 | **Lo que terminaste**: portadas como cartas | ≥ 1 terminada | ✓ | ✓ | ✓ |
| 4 | **En marcha**: obras con avance sin terminar, con % | hay avance abierto | — | ✓ | — |
| 5 | **Tu ritmo**: días con actividad (tira de 7 o de 30 días), racha, día y franja favoritos | ≥ 3 días con actividad | ✓ | ✓ | ✓ |
| 6 | **Top de géneros** | ≥ 2 géneros con obras | — | ✓ | ✓ |
| 7 | **Tu mejor nota**: obra mejor puntuada con su reseña | ≥ 1 nota | ★ | ✓ | ✓ |
| 8 | **Una frase tuya**: nota en el margen o cita | existe alguna elegible | ★ | ✓ | ✓ |
| 9 | **Una experiencia**: lugar o momento | existe alguna | ★ | ✓ | ✓ |
| 10 | **En compañía**: visionados conjuntos, actividad de club | existe alguna | — | ✓ | ✓ |
| 11 | **Tu año mes a mes**: tira de 12 meses con horas y terminadas escritas en cada mes | siempre en el anual | — | — | ✓ |
| 12 | **Récords**: mes más intenso, obra más rápida, sesión más larga | hay dato para cada récord | — | — | ✓ |
| 13 | **Top de autores / directores** | ≥ 2 con obras | — | — | ✓ |
| 14 | **Tu pila**: añadidas frente a sacadas | hay movimiento | — | — | ✓ |
| 15 | **Evolución de tu ardilla**: etapa actual, aventuras y botín del año | tiene mascota | — | — | ✓ |
| 16 | **Cierre**: «botín» del periodo, ardilla propia, Compartir / Publicar | siempre | ✓ | ✓ | ✓ |

★ = en la semana entra **solo una** de las stories de momento (7, 8 o 9): la primera que tenga
dato, en ese orden. La semana queda en ~5 stories como máximo.

Story 15: `pet_state` solo guarda la etapa ACTUAL. El salto «de bellota a adulta» solo se muestra
si el plan confirma que la etapa del 1 de enero se puede derivar de los recuentos con
`src/lib/pet/derive.ts`; si no, la story enseña la etapa actual más aventuras y botín fechados
en el año, sin inventar la etapa inicial.

En el anual, la story 2 incluye la comparación con el año anterior si existe; la 12 calla cada
récord sin dato en vez de mostrarlo vacío.

### La narradora

Comenta cada story en una burbuja. Su **variante** la decide el tipo dominante del periodo:

| Variante | Cuándo |
|---|---|
| lectora | libros dominan (por tiempo) |
| cinéfila | películas dominan |
| maratoniana | series dominan |
| exploradora | el periodo tiene experiencias o lugares y ninguna de las anteriores supera el 50 % |
| social | hay visionados conjuntos o actividad de club en ≥ 2 días |
| tranquila | `intensity = quiet` |
| festiva | siempre en el anual |

Orden de precedencia: `festiva` > `tranquila` > `social` > dominante por tiempo > `exploradora`.
Las frases **no se guardan**: se redactan al renderizar con `next-intl` a partir de las cifras del
payload.

## 4. Arquitectura y datos

### Cálculo en Node, no en SQL

Las reglas de qué cuenta (días de serie y no sesiones de serie; completados importados sin fecha
fuera de días y meses; abandonados ocultos; etc.) ya viven y están testeadas en `src/lib/stats`.
Reescribirlas en SQL crearía una segunda fuente que divergiría (principio 5). Flujo, con el mismo
patrón que `pet-nudges`:

```
pg_cron (lunes 09:00 / día 1 09:00 / 26-dic 10:00, Madrid; programado en UTC con guardia de hora local)
  → private.dispatch_wrap_ups(kind)          [SQL, lee app_base_url y cron_secret de Vault]
  → pg_net.http_post  → POST /api/cron/wrap-ups { kind }   [Node, CRON_SECRET, 503 si falta]
  → por lotes, para cada usuario con actividad en la ventana:
       buildWrapUp(client, userId, window)   [src/lib/wrap-ups/]
       upsert wrap_ups; push si intensity = full y period_start cambió
```

### Mejora previa: ventana cerrada en `src/lib/stats/period.ts`

`StatsPeriod` hoy solo tiene ventanas móviles (`"week"` = últimos 7 días, `"month"` = mes en
curso). Se añade una ventana explícita `{ start, endExclusive }` que aceptan las funciones `get*`
que use el wrap-up, para que wrap-up y `/estadisticas` compartan exactamente la misma lógica. Los
periodos móviles existentes no cambian de comportamiento.

### El tiempo, sin inventar

- Libros: `progress_sessions.duration_minutes`.
- Películas: `movies.duration_minutes` de las vistas en el periodo.
- Series: episodios (`episode_watches`) × `series.episode_runtime_minutes`. Sin duración, la
  serie cuenta en **episodios** y la story lo dice («8 h + 12 episodios sin duración»). Nunca un
  cero cosmético (principio 4).

### Tabla `wrap_ups`

| Columna | Tipo | Notas |
|---|---|---|
| `user_id` | uuid, FK `auth.users` `on delete cascade` | PK compuesta con `kind` |
| `kind` | enum `wrap_up_kind` (`week \| month \| year`) | |
| `period_start`, `period_end` | date | fechas locales Madrid, `period_end` inclusivo |
| `intensity` | text con CHECK (`full \| quiet`) | |
| `payload` | jsonb | versionado (`v: 1`); stories resueltas con cifras, ids de obra, variante de narradora y paleta. **Cifras, no frases** |
| `generated_at` | timestamptz | |
| `refreshed_at` | timestamptz null | para el límite de «Actualizar» |
| `seen_at` | timestamptz null | |
| `published_post_id` | uuid null, FK `posts` `on delete set null` | |

**RLS**: el dueño puede `select` y `delete` su fila. **Sin INSERT ni UPDATE desde el cliente**
(si el cliente pudiera escribir el payload, podría publicar cifras inventadas). Escriben:

- el **cron**, con service role, filtrando siempre por `user_id` explícito;
- la RPC `mark_wrap_up_seen(p_kind)` (`SECURITY DEFINER`): pone `seen_at` en la fila de
  `auth.uid()`;
- la server action **«Actualizar»**: identifica al usuario con su sesión, comprueba que la fila es
  suya, que no está publicada y que `refreshed_at` tiene más de 10 minutos; recalcula con
  `buildWrapUp` y escribe con service role. El payload nunca viaja desde el navegador;
- la server action **«Publicar»**: mismo patrón; crea el post con el resumen derivado del payload
  guardado y enlaza `published_post_id`.

Los seguidores **nunca** leen `wrap_ups`: leen el post.

### Privacidad dentro del payload

Las stories 7 y 8 solo usan reseñas, notas y citas **públicas** (`is_public`) y **sin spoiler**.
Lo privado no entra ni en el wrap-up del propio dueño: así una imagen compartida nunca filtra algo
marcado como privado.

## 5. Experiencia y piezas visuales

### Reproductor (`src/components/wrap-ups/`)

- `<dialog>` nativo con `showModal()` a pantalla completa, como el resto de capas del repo
  (Escape, trampa de foco y devolución de foco gratis).
- Toque derecha/izquierda avanza/retrocede, mantener pausa, flechas de teclado, barra de progreso
  arriba, avance automático a ~6 s.
- **`prefers-reduced-motion`**: sin avance automático y sin animaciones de entrada.
- Cada story es **texto real en el DOM**: cifra, unidad y periodo legibles por lector de pantalla
  (principio 1). La narradora es decorativa (`alt=""`) y su frase va como texto.
- Ruta: `/wrap/[kind]`.

### Lenguaje visual: póster pixel

- **Fondo**: color del tipo dominante (`--type-book`, `--type-movie`, `--type-series`); terracota
  `--accent` si el periodo está repartido. Tinta `#1c1714`.
- **Tipografía pixel** solo en rótulos y cifras: **Pixelify Sans** (Google Fonts, con tildes y ñ).
  Frases largas y reseñas en la fuente de la app.
- Bordes duros con sombra en escalera, portadas como cartas, glifos ● ■ ▲ junto a cada tipo (el
  color nunca diferencia solo, principio 2).
- Contraste de tinta y texto verificado sobre los tres fondos de tipo, en claro y oscuro.

### Arte nuevo (PixelLab, agente `pet-artist`)

- **Narradora común**: un personaje PixelLab nuevo con **7 estados** (lectora, cinéfila,
  maratoniana, exploradora, social, tranquila, festiva), una pose cada uno con animación idle
  corta. Sigue `docs/superpowers/specs/2026-09-03-mascota-arte-pixellab-design.md`.
- **Ardilla propia**: sprites existentes (`public/pet/sheets/<etapa>/<clase>`); no se genera arte
  por clase × etapa.
- Candidatos a `.superpowers/brainstorm/<fecha>/`; lo elegido a `public/pet/wrap-ups/`.

### Puntos de entrada

1. **Push** «Tu septiembre está listo 🐿️» → `/wrap/month`. Solo `full`.
2. **Home**: portada con anillo mientras `seen_at` sea nulo; después, acceso discreto hasta el
   siguiente.
3. **`/estadisticas`**: fila «Tus crónicas» con los que existan, incluidos los `quiet`.

### Imagen para compartir

`/api/og/wrap-up/[kind]` con `next/og`, **1080×1920**: póster de cierre con periodo, cifra
principal, hasta 4 portadas, ardilla propia y marca Biblioshare. Se descarga o se comparte con
Web Share API (en Android, el plugin de compartir de Capacitor). Portada externa que falla → carta
pixel con título y color del tipo; nunca un hueco roto.

### Tarjeta del feed

`posts.kind = 'wrap_up'` (valor aditivo de `post_kind`; y los que hagan falta en
`post_source_kind` / `target_kind`, igual que `experience_review`). Al publicar se congela en el
post un **resumen público**: periodo, cifra principal, portadas terminadas, variante de narradora.
La tarjeta muestra el cierre compacto; al pulsarla abre la imagen grande, **no** las stories. El
post respeta la visibilidad de posts existente (cuenta privada → solo seguidores aceptados).

## 6. Errores y casos límite

- **Idempotencia del cron**: `upsert` sobre `(user_id, kind)`; un reintento del mismo periodo
  recalcula sin duplicar y **no repite el push** (solo sale si `period_start` cambia).
- **Fallo por usuario**: se registra solo el recuento (sin ids) y se sigue; ese usuario conserva
  el anterior hasta el siguiente ciclo.
- **Trampas conocidas del cron** (data-model §6.2): `app_base_url` debe ser el alias de
  producción; cambiar `CRON_SECRET` exige redeploy.
- Relecturas: cuentan como pase; la portada sale una vez con «×2».
- Una sola obra o un día suelto: sin «favorita» ni «racha».
- Primer periodo del usuario: sin comparación; no «+100 %».
- Cuenta borrada: `on delete cascade`.
- «Actualizar» deshabilitado tras publicar.

### Caché (regla #437)

- `/api/og/wrap-up/[kind]` del dueño: cliente de su sesión, **sin** `use cache`.
- La imagen de un post publicado sale del resumen congelado del post; aunque el resumen es igual
  para todos los que lo ven, **quién** puede verlo depende de la sesión, así que tampoco se cachea
  en servidor. El argumento se escribe en la PR.
- Probar los e2e contra build de producción (`next-request-in-use-cache` pasa `next build` y
  falla en `next start`).

## 7. Pruebas

- **Vitest**: `buildWrapUp` con fixtures (semana vacía, `quiet`, `full`, series sin duración,
  relecturas, primer periodo, anual cortado el 25); reglas de aparición de cada story; variante de
  narradora y paleta; límites de ventana (semana ISO que cruza mes y año, cambio de hora de
  octubre en Madrid); ventana cerrada de `period.ts` sin romper los periodos móviles.
- **Base de datos**: un tercero no lee `wrap_ups`; las RPC rechazan la fila de otro; superficie 6
  de `docs/DRIFT-CHECK.md` (grants por columna de la tabla nueva y de `posts`).
- **Playwright** (contra build de producción): abrir desde la home, avanzar con teclado, queda
  visto, publicar, ver la tarjeta desde una segunda cuenta; la ruta OG devuelve PNG 1080×1920.
- **Visual** (`qa-verifier`): contraste sobre los tres fondos en claro y oscuro, 390 px.

## 8. Documentación al cerrar

- `docs/requirements/data-model.md`: tabla, enum, RPC, job, valores de `post_kind`.
- `docs/requirements/decisiones.md`: cálculo en Node y no en SQL; solo el último por tipo; anual
  el 26 de diciembre; solo contenido público en el payload.
- `docs/requirements/backlog.md`: §7.24.

## 9. Fuera de alcance

Se abren como issues al implementar:

- Historial de wrap-ups antiguos — **decidido no guardarlo** (`tipo:acta`).
- BiblioPlay dentro del wrap-up (`tipo:feature`, P3).
- Comparar tu wrap-up con el de amigos (`tipo:feature`, P3).
- Exportar en vídeo (`tipo:feature`, P3).
