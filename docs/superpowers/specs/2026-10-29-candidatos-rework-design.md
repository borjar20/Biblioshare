---
title: Candidatas al siguiente rework visual (después de sagas)
date: 2026-10-29
status: exploración cerrada; elegida **Perfil** como siguiente (pendiente de su propia spec)
area: ui
---

# Candidatas al siguiente rework visual

> Maquetas (fragmentos del compañero visual del brainstorming, sin el marco):
> - [`assets/candidatos-rework-maquetas.html`](assets/candidatos-rework-maquetas.html): las cinco
>   candidatas, cada una con cómo es hoy y la propuesta.
> - [`assets/candidatos-rework-prototipo-inicio-perfil.html`](assets/candidatos-rework-prototipo-inicio-perfil.html):
>   prototipo aterrizado de Inicio y Perfil en móvil (390 px) y escritorio (1280 px), con los tokens de
>   la app en oscuro, Fraunces, Geist y datos de la cuenta de dev. Es un documento completo; se abre
>   directamente en el navegador.
>
> Antecedente: el rework de sagas ([ficha](2026-10-27-sagas-ficha-lector-design.md),
> [atlas de la saga](2026-10-28-sagas-atlas-design.md) y atlas del índice, PR #1578).

## 1. Qué se buscaba

Recorrer la app y proponer qué pantallas merecen un rework después del de sagas. Es una exploración:
no lleva código de producto. Cada candidata elegida pasará después por su propia spec, su plan y su PR.

## 2. Decisiones del brainstorming (2026-10-29)

| Pregunta | Elegido | Descartado |
|---|---|---|
| Qué se hereda de sagas | **El objetivo visual**: una app más visual y llamativa, menos plana y seria. La portada como material, el color sacado de las obras, cifras grandes en serif y baldas en vez de rejillas | **Convertir más pantallas en atlas** (lienzo con zoom, territorios, lentes). Fue la primera propuesta y el usuario la corrigió: «la idea no es transformar todo en atlas» |
| Criterio de orden | Lo plana que es la pantalla hoy por lo que se ve (tráfico) | Lo que más reutilice del atlas |
| Siguiente rework | **Perfil** | Inicio, que fue la otra opción del prototipo aterrizado |

La primera tanda de maquetas (con atlas en Persona, territorios en Biblioteca, río temporal en
Estadísticas, etc.) no se guarda en `assets/`: quedó superada por la corrección. Lo que tenía de útil
pasó a las fichas de abajo.

## 3. Diagnóstico común

Recorridas en dev (escritorio a 1280 px y móvil a 375 px) Inicio, Biblioteca, Perfil, Persona,
Estadísticas, Retos y objetivos y Clubes, lo plano tiene la misma causa en casi todas:

- **Cajas de texto sobre fondo liso.** En Inicio, «en curso», «Sale esta semana» y «Tu semana» son
  tarjetas de texto; la obra en curso es una miniatura.
- **Portadas diminutas.** En el feed y en la actividad del perfil, de unos 24 px.
- **Mucha interfaz antes de las obras.** En Biblioteca, en móvil, hay unos 440 px de botones, pestañas,
  buscador y filtros antes de la primera portada.
- **Cifras como píldoras.** En el perfil, «8 libros · 2 series · 137 películas» son chips pequeños.

`docs/UI-GUIA.md` ya pide «la portada como material» y pone de modelo la ficha cinemática. El rework
consiste en llevar ese lenguaje (hero con la portada difuminada de fondo, portada grande, cifras en
Fraunces, baldas) a las pantallas que aún no lo tienen.

## 4. Ranking

| # | Pantalla | Por qué en este puesto | Tamaño |
|---|---|---|---|
| 1 | **Perfil** (`/u/[username]`) — **elegida** (#1580) | La carta de presentación de cada cuenta y la más plana de todas (texto, píldoras y filas). Riesgo de datos bajo: no cambia qué se ve, solo cómo. | 1 subproyecto |
| 2 | **Inicio** (`/`, #1581) | La pantalla más vista. Cubre #1454 y #1450 y puede cerrar #1453. Es la de más e2e y más streaming, así que pesa más. | 1–2 subproyectos |
| 3 | **Biblioteca** (`/coleccion`, #1582) | Muy usada. Hoy es una rejilla plana con mucho chrome encima. | 1–2 subproyectos |
| 4 | **Persona** (`/persona/[id]`, #1583) | Lista de hasta 200 filas. Tiene todos los datos para un hero cinemático y baldas por saga. | 1 subproyecto |
| 5 | **Retos y objetivos** (`/coleccion/rincon`, #1584) | Un título y una barra por reto. Es pequeño y vistoso. | 1 subproyecto pequeño |

Fuera de esta tanda:

- **Estadísticas** (un muro de unos 35 gráficos): se solapa con Crónicas y Wrap; antes hay que decidir
  qué queda en cada uno. Registrada en #1585.
- **Lectura conjunta del club**: tiene una duda de privacidad (la posición de otros miembros sale de sus
  `passes`). Registrada en #1586.
- **Género**, **Novedades** y **temporadas de serie**: no se registran. Género es una rejilla de poco
  tráfico, Novedades tuvo un rediseño Paper reciente (#1450) y la pestaña Episodios ya se rehízo en tres
  niveles.

## 5. Fichas

Reglas comunes a todas:

- Sin migraciones. Si alguna resultara necesaria, se para y se consulta.
- Sin `use cache` nuevo: todo depende de la sesión o de la visibilidad de quien mira (regla #437).
- El estado del lector sale de `passes`, nunca de `library_entries`.
- El color de fondo sale de la portada difuminada con CSS (como el hero de la ficha cinemática), sin
  extraer colores en el servidor.
- Cada bloque nuevo reserva su alto en el esqueleto (CLS, #284).

### 5.1 Perfil — elegida

**Problema.** La cabecera es avatar, nombre, contadores en píldoras y una tarjeta de mascota. Debajo, la
actividad es una lista de filas de texto con portadas de unos 24 px. No transmite quién es esa persona
ni qué le gusta.

**Propuesta** (prototipo, pestaña Perfil):

- **Banner** con un abanico de sus *destacados*, sobre el color difuminado de esas portadas. Sin
  destacados: sus últimas terminadas visibles; sin nada: degradado neutro.
- **Identidad**: avatar grande montado sobre el banner, nombre en Fraunces, @usuario, bio, seguidores y
  seguidos, y la acción principal (Editar perfil o Seguir).
- **Cifras grandes**: libros, películas y series (los mismos de `LibraryStats`) más la nota media.
- **Leyendo ahora**: el pase en curso más reciente que quien mira puede ver, con barra de avance y la
  mascota (`ProfilePet`) al lado.
- **Destacados**: balda de portadas grandes con enlace a su colección.
- **Su año**: obras terminadas por mes del año en curso, su mejor mes y su obra mejor valorada.
- **Actividad como muro**: portadas agrupadas por mes con los dots de la nota encima; las reseñas se
  intercalan como tarjeta con cita. Las pestañas Colección y Experiencias se quedan.
- **Escritorio**: banner a todo el ancho; identidad, cifras, leyendo ahora y su año en una columna de
  unos 340 px a la izquierda; destacados y muro a la derecha.

**Datos.** Todo existe:

- destacados: `getLibraryItems(…, { favoritesOnly: true })`, que ya usa la pestaña Colección;
- cifras: `getLibraryStats`;
- actividad: la consulta actual de `ActivityTab`;
- mascota: `ProfilePet`.

Hay dos lecturas nuevas, sin esquema nuevo: **nota media** (hoy `LibraryStats` solo cuenta por tipo) y
**su año** (terminadas por mes). Las dos salen de `passes` con el cliente de la petición, así que RLS
y visibilidad ya filtran. «Leyendo ahora» también.

**Piezas reutilizables:** el hero difuminado de la ficha cinemática, `FavoritesShelf`, `RatingDots` (o
sus dots) y `UserAvatar`.

**Riesgos.**

- **Privacidad.** El rework no cambia *qué* se ve. Un perfil privado sigue en `PrivateProfileStub`. Las
  dos lecturas nuevas deben contar solo lo que quien mira ya puede ver: hay que probarlo con dueño,
  seguidor y tercero.
- **Reparto en escritorio.** #431: el reparto masonry del perfil depende del orden de los bloques; el
  nuevo layout de columnas fijas lo sustituye.
- **e2e del perfil** (`page.test.tsx`, avatar, seguidores) y la imagen OG (`opengraph-image.tsx`), que no
  cambia.

**Tamaño:** 1 subproyecto. Encaja #529 (pensamientos propios en Actividad) si la spec del perfil lo
decide.

### 5.2 Inicio

**Problema.** Saludo, tarjeta de texto de «en curso» con una miniatura, «Sale esta semana» y «Tu semana»
como cajas, y un feed de filas con portadas de 24 px.

**Propuesta** (prototipo, pestaña Inicio):

- **«Ahora» como hero**: la obra en curso grande sobre su portada difuminada, anillo de avance, «Te queda
  1 página», «Registrar sesión» y «Lo terminé». Los otros pases en curso pasan a pastillas.
- **Tu semana**: una columna por día con las portadas que tocaste, la racha en cifra grande y la meta de
  hoy en anillo. En escritorio va dentro del hero.
- **Sale esta semana**: tira de pósteres con la fecha encima.
- **Feed con portada protagonista**, una tarjeta por tipo:
  - «terminó y valoró»: fondo difuminado, portada grande, dots y reseña en cita;
  - actividad de club: arte del club, avatares de quien se apunta y «Apuntarme»;
  - pensamiento: en Fraunces grande;
  - lote «terminó 4 películas»: segunda fase, ligado a #1226.
- **Escritorio**: hero a todo el ancho y, debajo, feed y lateral (retos, novedades, a quién seguir).

**Datos:** `TodayBlock`, `progress_sessions` de la semana, `ThisWeekReleases`, `getFeed` y `StatsRail`;
nada nuevo.

**Riesgos:**

- CLS (#284) con streaming por sección;
- es la pantalla con más e2e;
- `.home-grid` reordena áreas por breakpoint y hay que rehacerlo.

**Tamaño:** 1–2 subproyectos: hero y semana; luego el feed.

### 5.3 Biblioteca

**Problema.** Unos 440 px de herramientas, pestañas y filtros antes de la primera portada, y después una
rejilla plana de 24 en 24 donde el estado es una etiqueta en la esquina.

**Propuesta:**

- cabecera con cifras («117 obras · 96 terminadas · 3 este mes»);
- las herramientas (Cuaderno, Retos, Estadísticas) pasan a iconos;
- «En curso» con portada y avance;
- una balda por estado (Pendiente, Terminadas este año) con «ver todo», que lleva a la rejilla filtrada
  de hoy;
- colecciones en abanico.

**Datos:** `passes` y colecciones; existen.

**Riesgos:** filtros por URL, #772 y #774, y e2e de biblioteca (`biblioteca-*`).

**Tamaño:** 1–2 subproyectos.

### 5.4 Persona

**Problema.** Una columna con la bio y una lista de hasta 205 filas por año. «Has leído el 1 % de su
obra» queda escondido en la columna lateral.

**Propuesta:** hero con la portada más conocida difuminada, el anillo «llevas X de su obra», una balda
por saga del autor con «te toca» (la balda de la ficha de saga) y, debajo, la lista de siempre.

**Datos:** `PersonProfile` ya trae año, saga, estado de quien mira, nota y `sagas` con su avance.

**Riesgos:** bajos; `ProfileWork` ya documenta la regla #437.

**Tamaño:** 1 subproyecto.

### 5.5 Retos y objetivos

**Problema.** Cada reto es un título y una barra; no se ve qué obras cuentan ni cuál sumaría.

**Propuesta:** cada reto es una balda con las portadas que cuentan y huecos para las que faltan («el
siguiente hueco: El imperio final, 99 %»), más una celebración al completarlo.

**Datos:** retos, `match.ts` y `passes`.

**Riesgos:** bajos.

**Tamaño:** 1 subproyecto pequeño.

## 6. Siguiente paso

Brainstorming y spec propia del **rework del perfil** (`AAAA-MM-DD-perfil-visual-design.md`), partiendo
del prototipo. Las otras cuatro candidatas y las dos descartadas quedan como issues `tipo:feature`,
`P3`, enlazadas a este documento: #1580 (perfil, la siguiente), #1581–#1584 y #1585–#1586.
