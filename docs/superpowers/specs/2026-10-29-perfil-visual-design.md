---
title: Perfil visual (rework visual, candidata 1)
date: 2026-10-29
status: implementado (rama claude/perfil-visual, PR pendiente)
area: ui / social
issue: "#1580"
---

# Perfil visual

> Maquetas:
>
> - [`assets/perfil-visual-prototipo.html`](assets/perfil-visual-prototipo.html): prototipo con lo
>   decidido, en móvil (390 px) y escritorio (1280 px). Se abre en la pestaña Perfil. Es un documento
>   completo: se abre directamente en el navegador.
> - [`assets/perfil-visual-preguntas.html`](assets/perfil-visual-preguntas.html): las cuatro preguntas
>   del brainstorming con sus opciones (muro, cabecera, mezcla de cabecera y bloques). Son fragmentos
>   concatenados del compañero visual, sin el marco.
>
> Contexto: [candidatas al rework visual](2026-10-29-candidatos-rework-design.md) (§5.1). Lenguaje
> visual: [ficha cinemática](2026-09-23-ficha-cinematica-design.md).

## 1. Problema y alcance

`/u/[username]` es la pantalla más plana de la app:

- La cabecera es avatar, nombre, contadores en píldoras («8 libros · 2 series · 137 películas») y una
  tarjeta suelta de mascota.
- La actividad es una lista de filas de texto agrupadas por día, con portadas de unos 24 px.

No transmite quién es esa persona ni qué le gusta.

El rework lleva al perfil el lenguaje visual de la ficha cinemática: la portada como material, el
color sacado de las obras, cifras grandes en Fraunces y portadas en vez de filas. **No cambia qué ve
cada persona, solo cómo se presenta.**

Fuera de alcance:

- la imagen OG (`opengraph-image.tsx`);
- `/u/[username]/seguidores` y `/siguiendo`;
- el contenido de las pestañas Experiencias y Colección;
- la vista de perfil privado (`PrivateProfileStub`);
- cualquier migración. Si alguna resultara necesaria, se para y se consulta.

## 2. Decisiones (brainstorming 2026-10-29)

| Pregunta | Elegido | Descartado |
|---|---|---|
| Qué es el muro de la actividad | **Muro mixto por mes**: cada obra una vez por mes con su último estado y las publicaciones sin portada intercaladas como tarjetas | Estantería de terminadas sacada de `passes` con el feed en otra pestaña (dos sitios; enseña lo que no publicó); feed con tarjetas más visuales (se sigue leyendo como lista) |
| Cabecera | **Capas**: mosaico de sus últimas terminadas, atenuado, al fondo, y abanico de sus destacados delante | Solo destacados; «leyendo ahora» como fondo (dice qué hace hoy, no quién es; vacío sin nada en curso); solo mosaico (ruidoso, nadie lo elige); mosaico único con destacados en grande (los destacados se leen menos como elección suya) |
| Bloques entre cabecera y muro | **Cifras grandes**, **Leyendo ahora + mascota** y **Su año** | Destacados en balda (repite el abanico) |
| Entrega | Una PR en dos fases con punto de control visual cada una | — |

Sobre «Su año»: la regla del proyecto es que el perfil enseña lo que la persona comparte y sus
herramientas viven en Biblioteca. El usuario lo eligió de todos modos. Se acota a un resumen (barras por
mes, mejor mes y mejor valorada), calculado solo con lo que quien mira ya puede ver. No enlaza a
Estadísticas ni se convierte en un panel.

## 3. Composición

Un único árbol responsive (como la ficha cinemática), siempre con los tokens del tema activo.

### 3.1 Móvil (de arriba abajo)

1. **Cabecera** (unos 200 px), sin la barra superior de la app encima; «‹» y ⚙/avatar flotan sobre
   ella:
   - **fondo**: el mosaico, una rejilla de portadas de sus últimas terminadas, al ~55 % de opacidad,
     con un velo que funde hacia `--background`;
   - **delante**: el abanico de destacados, hasta 4 en móvil y 6 en escritorio, girados ±5° y con
     sombra.
2. **Identidad**, montada sobre el borde inferior de la cabecera:
   - avatar de 84 px con borde del color de fondo (se amplía como hoy con `ImageZoom`);
   - a la derecha, la acción principal: «Editar perfil» y ⚙ para el dueño; Seguir, la campana,
     «Entre nosotros» y las acciones de seguridad para un visitante (los mismos componentes de hoy);
   - nombre en Fraunces de 28 px, @usuario y «desde {año}», bio, seguidores y seguidos (enlaces de
     hoy).
3. **Cifras grandes**, en cuatro columnas: libros, películas, series y nota media.
4. **Leyendo ahora**:
   - tarjeta con la portada difuminada de fondo, portada, título y barra de avance;
   - la mascota (`ProfilePet`) a la derecha, en pequeño;
   - con 2 o 3 en curso, las demás van como pastillas debajo;
   - sin nada en curso, solo la mascota (o nada si no tiene).
5. **Su año** («Su 2026»): total, barras por mes, mejor mes y mejor valorada.
6. **Solicitudes de seguimiento** (solo el dueño, como hoy).
7. **Pestañas** (sin cambios: dueño Actividad · Experiencias; visitante + Colección).
8. **Muro** (§5).

### 3.2 Escritorio (desde `lg`)

- La cabecera ocupa todo el ancho (unos 250 px), con el abanico a la derecha.
- Debajo, la rejilla `340px | minmax(0,1fr)`, subida unos 70 px sobre la cabecera:
  - **izquierda**: identidad, acciones, cifras, Leyendo ahora y Su año;
  - **derecha**: pestañas y muro (6 columnas de portadas).

El reparto masonry actual del perfil (#431) desaparece con este layout.

### 3.3 Componentes

```
src/components/profile/
  profile-hero.tsx          cabecera: mosaico + abanico (servidor)
  profile-identity.tsx      avatar, nombre, bio, counts, acciones (sustituye a profile-header.tsx)
  profile-figures.tsx       cifras grandes
  profile-now.tsx           leyendo ahora + mascota
  profile-year.tsx          su año
  profile-wall.tsx          muro (cliente): meses, portadas, tarjetas, cargar más
  profile-skeletons.tsx     esqueletos con el alto reservado
```

`ProfileHeader` se retira y sus piezas pasan a `profile-identity`. `ProfilePet` y `UserAvatar` se
reutilizan. El hero difuminado comparte técnica con el de la ficha (portada a `blur` con velo), sin
extraer colores en el servidor.

## 4. Datos

Ninguno lleva `use cache` (regla #437): todos dependen de quién mira. Todos usan el cliente de la
petición, así que RLS (`can_view_profile` en `passes`, la visibilidad de `posts`) decide qué filas
llegan. El estado sale de `passes`; nada lee `library_entries`.

Lecturas nuevas en `src/lib/profile/`, cada una tras su `<Suspense>` con esqueleto de alto fijo (CLS,
#284):

| Función | Qué devuelve | Consulta |
|---|---|---|
| `getProfileHero(supabase, userId)` | `{ pinned: Cover[] (≤6), recent: Cover[] (≤21) }` | `passes` activos con `pinned_order` no nulo, ordenados; y `passes` `completed`, por `finished_on` desc (empate `updated_at`), con la portada de la obra (`hydrateItems`) |
| `getProfileFigures(supabase, userId)` | `{ book, movie, series, ratingAvg: number \| null, ratingCount }` | `getLibraryStats` + media de `rating` de los `passes` completados con nota. Con menos de 3 notas, `ratingAvg = null` → «—» |
| `getProfileNow(supabase, userId)` | `Cover & { progressLabel, progressPercent }[]` (≤3) | `passes` activos `in_progress`, por `updated_at` desc; avance con `formatPosition`, como en Persona |
| `getProfileYear(supabase, userId, now)` | `{ year, total, byMonth: number[12], bestMonth, topRated: Cover \| null }` o `null` si `total = 0` | `passes` `completed` con `finished_on` en el año en curso. El año y el mes se resuelven en `Europe/Madrid` (mismo criterio que `wrap-ups/windows.ts`). `finished_on` es `date`: se parte a mano, nunca con `new Date()` |

El mosaico solo usa terminadas, así que las abandonadas no aparecen nunca. Las cifras de libros,
películas y series conservan la semántica actual de `getLibraryStats` (pases activos, incluidos los
abandonados). Si deben respetar `hideDropped`, se decide aparte en #772, no en este rework.

### 4.1 Reglas de la cabecera

- **Abanico:** los destacados. Sin destacados, las 4 (o 6) últimas terminadas.
- **Mosaico:** las últimas terminadas sin las del abanico, repitiendo en ciclo si faltan para llenar
  la rejilla. Con menos de 3 terminadas en total no hay mosaico, sino un degradado con `--accent`.
- **Sin portada:** bloque de color con iniciales, como el índice de sagas (solo letras).
- Las portadas del mosaico son decorativas (`aria-hidden`, sin enlace). Las del abanico enlazan a la
  ficha de la obra.

## 5. El muro

### 5.1 Fuente

La misma de hoy: `getFeed(supabase, viewerId, { actorId })` en servidor y `loadMoreProfileFeed` para
paginar. No hay consulta nueva: el muro enseña lo que la persona **publicó**, con su visibilidad.

### 5.2 Modelo: `buildProfileWall` (`src/lib/profile/wall.ts`)

Función pura: `(events: FeedEntry[]) → WallMonth[]`.

```ts
type WallCover = {
  key: string;            // itemType:itemId
  itemType: ItemType; itemId: string; title: string; coverUrl: string | null;
  state: { kind: "rated"; rating: number } | { kind: "in_progress" } | { kind: "dropped" }
       | { kind: "finished" } | { kind: "episodes"; season: number | null; count: number };
  postId: string | null;  // el post más reciente de esa obra en el mes
  reactions: number;      // suma de las reacciones de sus posts del mes
  at: string;             // fecha del evento más reciente (orden dentro del mes)
};
type WallCard = { kind: "thought" | "review" | "experience" | "joint" | "wrap_up"; event: FeedEntry; at: string };
type WallMonth = { key: string /* AAAA-MM */; label: string; covers: WallCover[]; cards: WallCard[];
  sequence: Array<{ type: "covers"; covers: WallCover[] } | { type: "card"; card: WallCard }> };
```

Reglas:

- **Mes**: el de la fecha del evento en `Europe/Madrid`, en orden descendente.
- **Una obra por mes:** se agrupan sus eventos (`started`, `progressed`, `finished`, `rated`,
  `reviewed`, `dropped`, `watchedEpisode`) y el estado es el del más reciente, con estas precedencias:
  - con nota en el mes, `rated`;
  - abandonada, `dropped`;
  - terminada sin nota, `finished`;
  - solo episodios, `episodes` con su temporada y su número;
  - en otro caso, `in_progress`.
- **Tarjetas intercaladas:**
  - **pensamiento**;
  - **reseña con texto**: la portada sigue en el muro, y la tarjeta añade la cita con su nota;
  - **experiencia** y **reseña de experiencia**;
  - **visionado conjunto**;
  - **crónica compartida** (`wrap_up_share`).

  Cada tarjeta va en su sitio del tiempo: `sequence` parte las portadas del mes en tramos entre
  tarjetas.
- **Grupos de persona** (`person-group`) se deshacen en sus eventos antes de agrupar.
- **Paginación:** «Cargar más» añade eventos y se recalcula entero. Un mes partido entre dos páginas
  queda unido y el estado de cada obra se recalcula con todos sus eventos.

### 5.3 Presentación

- **Rótulo del mes**: «Octubre · 4 obras» (mono, mayúsculas). Se omite el año si es el actual.
- **Rejilla**: 3 columnas en móvil y 6 en escritorio, a 2:3.
- **Insignia** de cada portada, arriba a la derecha:
  - dots de la nota (`RatingDots` en modo lectura);
  - «EN CURSO» en `--gold`;
  - «LA DEJÓ», con la portada atenuada;
  - «T2 · 6 EP.».

  Si tiene reacciones, «❤ N» abajo.
- **Tocar una portada** abre `/post/[postId]`, que conserva reacciones, comentarios y contexto. Si no
  hay post, abre la ficha de la obra.
- **Tarjetas**: reseña y pensamiento con la cita en Fraunces itálica; experiencia con su portada de
  álbum; crónica con su portada. Las interacciones van dentro de la tarjeta, como hoy (`FeedItem` y sus
  variantes, sin duplicar marcado).
- **Vacío**: el `EmptyState` de hoy (texto distinto para el dueño, con CTA a Buscar).

## 6. Privacidad y casos límite

- **Perfil privado** sin permiso: `PrivateProfileStub`, sin cambios. **Bloqueado por**: 404, como hoy.
- Lo nuevo (mosaico, abanico, nota media, Leyendo ahora y Su año) solo puede enseñar filas que RLS ya
  deja leer a quien mira. Se prueba con cuatro miradas: **dueño**, **seguidor aceptado**, **tercero
  con perfil público** y **anónimo con perfil público**.
- Cuenta nueva sin nada:
  - degradado de acento en la cabecera y sin abanico;
  - cifras a 0 y nota «—»;
  - sin Leyendo ahora ni Su año;
  - muro vacío con su `EmptyState`.
- Obra sin portada: bloque de color con iniciales, en el muro y en la cabecera.
- `prefers-reduced-motion`: el abanico no anima al cargar y el `hover` de las portadas no se desplaza.
- Objetivos táctiles ≥ 44 px (`tap-44`) en portadas del abanico y del muro.

## 7. Pruebas

- **Vitest:**
  - `buildProfileWall`:
    - una obra por mes con cada precedencia de estado;
    - sesiones y episodios fundidos;
    - reseña con texto (portada + tarjeta);
    - tarjetas en su sitio del tiempo;
    - mes partido entre páginas;
    - grupos de persona deshechos;
    - zona horaria (un evento a las 00:30 del día 1 en Madrid cae en su mes).
  - Reglas de la cabecera: sin destacados, menos de 3 terminadas y repetición en ciclo.
  - `getProfileYear`: año y mes en Madrid, `finished_on` como `date`, `null` sin terminadas.
  - `getProfileFigures`: «—» con menos de 3 notas.
  - Se adapta `page.test.tsx` del perfil.
- **e2e** contra `npm run build` + `next start` (regla #437), en escritorio y Pixel 7, en un fichero
  nuevo `e2e/perfil-visual.spec.ts`:
  - perfil propio y ajeno con cabecera, cifras, Leyendo ahora y Su año;
  - perfil privado sin permiso con su aviso y sin bloques;
  - muro agrupado por mes y «Cargar más» que une meses;
  - tocar una portada lleva a `/post/[id]`;
  - a 390 px sin scroll horizontal.

  Se repasan las e2e que pasan por `/u/` (`go-perfil`, `avatar-upload`, `avisos-por-persona`,
  `entre-nosotros`, `experiencias-*`, `a11y-landmark-main`, entre otras).

## 8. Entrega

Una PR contra `main`, en dos fases, cada una con un punto de control visual del usuario (capturas de
móvil y escritorio, tema oscuro y claro):

1. **Cabecera y bloques:** hero, identidad, cifras, Leyendo ahora, Su año y layout de escritorio. El
   muro sigue siendo la lista de hoy.
2. **El muro:** `buildProfileWall` y `profile-wall.tsx`.

Al cerrar:

- `decisiones.md`: entrada «Perfil visual»;
- casilla en `backlog.md`;
- `docs/architecture/graph.json` regenerado;
- evidencia en `docs/testing/`;
- `UI-GLOSARIO.md` si nace un término (p. ej. «Su año»);
- cierre de #1580 (y de #431 si el layout lo resuelve);
- declaración de la regla #437 en la PR: sin `use cache` nuevo.

## Ajustes durante la implementación

Lo que cambió respecto a lo diseñado arriba:

- **`latestPassKeys` en vez de `getLibraryView`.** Las lecturas del perfil recortan en SQL a los últimos
  pases activos (por estado o por destacado) y solo hidratan esas obras.
- **Contrato de episodios.** Cada publicación `watched` lista los episodios del día, incluido el suyo; por eso el
  muro suma `episodes.length`, o 1 si no trae la lista.
- **Oro con `-ink` y `-graphic`.** Un solo token de oro no pasaba el contraste en ambos temas (#577).
- **Mascota a escala 1 en una ventana de 72 px:** `PetSprite` solo admite `1 | 2 | 3`.
- **Esqueleto de página con el layout nuevo** (`PROFILE_LAYOUT_CLASS` compartido), para no mover la página al
  resolverse los `<Suspense>`.
- **Claves i18n nuevas:** `memberSinceInline` y `coverLabelWithReactions`. La nota del muro se lee con
  `formatDots` («X de 5»).
- **`CoverTile` con `initialsClassName`,** para ajustar el tamaño de las iniciales según el contexto.
- **e2e:** la cuenta `devtest` es admin y lee perfiles privados, así que los casos de privado y de seguidor
  usan visores temporales sin rol. Helper `waitForProfileSettled` antes de comprobar ausencias. Se añadió un
  quinto caso, el del seguidor aceptado.
- **Retoque del usuario:** la reseña con texto es una baldosa de 2 columnas dentro de la rejilla (sustituye a la
  portada; rejilla `grid-flow-row-dense`) para que no queden huecos.
