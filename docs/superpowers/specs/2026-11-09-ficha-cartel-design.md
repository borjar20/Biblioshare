# La ficha como cartel propio de cada obra — diseño

[Histórico · congelado 2026-11-09]

**Estado:** aprobado por Borja (brainstorming 2026-11-09).
**Antecedente:** `docs/superpowers/specs/2026-09-23-ficha-cinematica-design.md`. Los reworks de
«Sacar un lomo» y del ritual de sesión y cierre abrieron la pregunta de a qué otras pantallas llevar
su esencia. Los prototipos de baldas y objetos de madera para otras áreas no convencieron: aquí se
conserva la intención de dar más apartado artístico, sin esa estética.

## Problema

La ficha de una obra (`/libro/[id]`, `/pelicula/[id]`, `/serie/[id]`) y sus pestañas se ven iguales
para todas las obras: la imagen se queda en una banda de fondo y el resto es la interfaz genérica de
la app. Una película de terror y una comedia no se distinguen.

## Decisiones

1. **La identidad sale de la propia obra.** Cada ficha es un cartel con su imagen y su color.
2. **Es estética, no juego.** Nada de minijuegos, gestos obligatorios ni pasos nuevos: navegar la
   ficha cuesta lo mismo que hoy.
3. **Cartel a sangre**, con tres formas según la imagen disponible.
4. **Tema teñido:** las pestañas respetan el tema claro u oscuro del usuario, pero el fondo, las
   tarjetas, las líneas y los títulos toman un matiz de la obra.
5. **Una sola letra de cartel** (Anton) para el título y los títulos de sección, en todas las obras.
6. **En escritorio, columna de cartel** fija a un lateral. No depende de tener imagen apaisada.
7. **El color se extrae en servidor y se cachea por URL.** Sin migración.
8. **Una sola PR.** Cartel, tinte y pestañas comparten árbol de componentes.

## Qué se ve

### Las tres formas del cartel

Se elige por el origen de la imagen, sin analizar cada una:

| Forma | Cuándo | Qué se pinta |
|---|---|---|
| `bleed` | Portada de `image.tmdb.org` | El póster a toda la anchura, pedido en 780 px |
| `atmosphere` | Cualquier otra portada (OpenLibrary, Google Books, Supabase Storage) | La portada muy difuminada de fondo, con grano suave, y encima nítida a un máximo de 180 px de ancho |
| `type` | Sin portada, o si la imagen falla al cargar | El título gigante y tenue como imagen, sobre un degradado del tono de la obra |

Motivo, medido en el catálogo de desarrollo el 2026-11-09:

| | Total | Sin portada | Ancho de la portada |
|---|---|---|---|
| Libros | 397 | 136 (34 %) | La gran mayoría entre 180 y 340 px |
| Películas | 644 | 45 (7 %) | TMDB ofrece 780 px o más |
| Series | 83 | 6 (7 %) | TMDB ofrece 780 px o más |

A toda pantalla en un móvil hacen falta unos 800 px, así que ninguna portada de libro aguanta
estirada. Los datos de producción no se pudieron consultar.

### Móvil (y hasta 1279 px)

- El cartel abre la página a toda la anchura, con altura `min(68svh, 560px)`.
- Título, autor o director, nota, `PassCard` y pestañas, sobre el degradado que funde la imagen con
  el fondo.
- El título va siempre sobre el degradado, nunca directamente sobre la foto, para leerse igual con
  pósters claros u oscuros.
- En la pestaña Información, la columna de datos baja debajo del texto, con el orden móvil actual de
  `InfoLayout`.

### Escritorio (desde 1280 px, `xl`)

- El cartel es una columna a la izquierda: 33 % del ancho, máximo 520 px, `sticky` bajo la barra
  superior y con la altura de la ventana. Acompaña al hacer scroll por las pestañas.
- A la derecha: título, autor, nota, `PassCard`, pestañas y contenido.
- La pestaña Información mantiene texto y columna de datos en paralelo, con la columna de datos a
  280 px.

### Pestañas

Información, Comunidad, Mi registro y Episodios conservan contenido y orden. Cambian:

- fondo, tarjetas, bordes y fichas, con el matiz de la obra;
- títulos de sección, en Anton y en el color de título de la obra;
- la barra de pestañas, con el acento de la obra.

El texto largo (sinopsis, reseñas, diario) mantiene la letra normal.

### Título

Tamaño por tramos de longitud:

| Caracteres | Móvil | Escritorio |
|---|---|---|
| ≤ 20 | 64 px | 88 px |
| ≤ 45 | 50 px | 66 px |
| ≤ 80 | 38 px | 50 px |
| > 80 | 30 px | 38 px |

Con `overflow-wrap: anywhere`. Los títulos en alfabetos que Anton no cubre (el catálogo tiene alguno
en hebreo) caen a la letra normal.

## Cómo se construye

### Color: `getWorkHue(coverUrl)`

Nuevo módulo en `src/lib/catalog/`.

- Con `use cache` y `cacheLife` larga. Solo recibe la URL: si una obra cambia de portada, cambia la
  clave.
- Respuestas a la regla #437:
  1. El dato es igual para un anónimo, el dueño y un tercero: depende de la imagen, no de quien mira.
  2. No toca `cookies()`, `headers()`, `searchParams` ni Supabase.
- Solo descarga de los orígenes permitidos en `next.config.ts` (`images.remotePatterns`). Otra URL
  no se descarga.
- Pide la variante más pequeña: `w92` en TMDB, `-S` en OpenLibrary, y la original en el resto.
- Con `sharp`: reduce a 24×36, pasa a OKLCH, descarta píxeles con L < 0,12, L > 0,95 o C < 0,03, y
  hace un histograma de 24 tramos de tono ponderado por C². El tono es el centro del tramo mayor.
- Portada sin color: si la media de C sobre todos los píxeles es menor que 0,01, no hay tono fiable y
  se usa el de respaldo. Medido: *El silencio de los corderos* 0,0156 (con color); *Juego de tronos*
  0,0004 y *Rayuela* 0,0018 (sin color).
- Límite de 2 s. Si falla o se pasa, **lanza un error**, para que el fallo no quede en caché. Quien la
  llama lo captura y usa el tono de respaldo; la siguiente visita lo reintenta.

**Tono de respaldo:** hash estable del título a 0–359. Se usa sin portada, con portada sin color o
si falla la extracción.

La llamada se espera dentro del `<Suspense>` que ya tiene la ficha, con `ItemShellSkeleton`. Solo la
primera visita a cada obra lo nota (medido: 40–270 ms en TMDB y 1–1,6 s en OpenLibrary).

### Tinte: `WorkScope`

Envoltorio de la ficha que recibe `--work-hue` y redefine en su ámbito, con un CSS module y la misma
técnica que `ritualScope`, los tokens de la app que usan los componentes de dentro (`--background`,
`--surface`, `--surface-muted`, `--foreground`, `--foreground-soft`, `--muted-foreground`, `--border`,
`--accent`, `--accent-foreground`, `--accent-ink`). Colores en OKLCH con luminosidad y croma fijos por
tema; solo varía el tono:

| Token | Claro (L, C) | Oscuro (L, C) |
|---|---|---|
| Fondo | 0,945 · 0,018 | 0,20 · 0,028 |
| Tarjeta | 0,975 · 0,010 | 0,25 · 0,030 |
| Título | 0,36 · 0,12 | 0,90 · 0,07 |
| Texto | 0,27 · 0,03 | 0,88 · 0,02 |
| Texto suave | 0,42 · 0,03 | 0,76 · 0,02 |
| Acento | 0,52 · 0,16 | 0,72 · 0,14 |

Valores de partida, de las maquetas. El test de contraste manda: si algún tono no llega a AA, se
ajustan estas luminosidades.

Los tokens `--status-*` y `--type-*` no se tiñen: su significado no depende de la obra.

Las hojas `ritualScope` (sesión y cierre) redefinen los mismos tokens en su propio ámbito, así que
conservan la estética de madera.

### Cartel

- Función pura `pickPosterArt({ coverUrl })` → `bleed`, `atmosphere` o `type`. Sustituye a
  `pickHeroBackground`.
- `ItemHero` se rehace como cartel. Conserva el zoom de la portada (`ImageZoom`).
- Helper para pedir el póster de TMDB en `w780`, usado solo aquí. El resto de la app sigue en `w342`
  y `cdn-loader.ts` mantiene su política de no subir de tamaño.
- Un componente cliente pasa a `type` si la imagen da error.
- `backdrop_url` deja de usarse en la ficha; se queda en la base de datos.
- La imagen del cartel se carga con prioridad, porque es el candidato a LCP.

### Letra

Anton con `next/font`, instanciada y aplicada solo en la ficha, no en el layout raíz.

### Lo que se mantiene

- `ItemDetailTabs`, sus slots y `<Suspense>`, `?tab=` y los `data-testid`.
- `PassCard`, `StickyPassCta` y el resto de acciones, que son los mismos componentes.
- Las server actions y el esquema.
- Regla #437: ninguna lectura dependiente del usuario entra en `use cache`.

## Errores

| Qué pasa | Qué se ve |
|---|---|
| El color no se puede extraer o tarda más de 2 s | Tono de respaldo; la siguiente visita reintenta |
| La imagen no carga | Forma `type` |
| Alfabeto no cubierto por Anton | Letra normal |

Ningún fallo de imagen o de color impide mostrar la ficha.

## Accesibilidad y movimiento

- Contraste AA de todos los tokens teñidos, en los 360 tonos y en los dos temas.
- El degradado garantiza la legibilidad del título sobre la imagen.
- Foco visible con el acento de la obra.
- El cartel no se anima, así que `prefers-reduced-motion` no aplica.

## Pruebas

**Vitest:**

- `pickPosterArt`: los tres casos y los orígenes.
- Extracción del tono: portadas con y sin color, orígenes rechazados, y que un fallo lanza error.
- Hash estable del título.
- Contraste AA en los 360 tonos y en los dos temas.
- Tramos de tamaño del título.

**Playwright contra build de producción:**

- Los tres casos de imagen, en móvil y escritorio y en tema claro y oscuro.
- Las pestañas y `?tab=`.
- Columna `sticky` en escritorio.
- Una pasada de axe de contraste en las tres fichas.
- Los specs existentes que dependan de la cabecera se ajustan sin perder lo que comprueban.

**Preview de Vercel:** localmente solo se construye con webpack; hay que revisar la build de
Turbopack a ojo.

## Fuera de alcance

- Las fricciones del registro de la issue #1164, que son de flujo.
- Rellenar `backdrop_url` o usar imagen apaisada.
- Llevar este lenguaje a otras pantallas (perfil, sagas…).
- Las hojas de registrar sesión y cerrar lectura.
- Cambios en server actions o esquema.
