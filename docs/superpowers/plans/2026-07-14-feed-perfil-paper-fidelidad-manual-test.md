# Checklist manual — Fidelidad Paper del Feed y el Perfil

Cierra los gaps entre Inicio (feed) y Perfil (Panel · Colección · Actividad) y
el mockup `Paper - IA nueva (Inicio + Perfil).html`. Todo es presentación
salvo tres ampliaciones de lectura: `getFeed` ahora trae `status` de la
entrada (verbo "añadió") y el autor de los libros, y hay una consulta nueva
`getRecentReviews` (reseñas de UN usuario) para la pestaña Actividad.

Decisiones conscientes contra el mockup: las subtabs del perfil siguen en
mono (consistencia con clubes/colección), los filtros del feed conservan su
semántica (sin "Pantalla" ni "Clubes") y el calendario mantiene las
miniaturas de portada en los días activos.

## Preparación

`npm run dev`, login con una cuenta que siga a gente con actividad (reseñas,
episodios, altas recientes). Para la parte de visitante hace falta un segundo
perfil público con reseñas y favoritos.

## 1. Inicio · Feed (`/`)

- [ ] Junto al título **"Novedades"** aparece a la derecha **"sigues a N"** en
      mono pequeño, con tu número real de seguidos.
- [ ] Los filtros son **chips mono en mayúsculas** con borde; el activo va en
      terracota (texto + borde + fondo tenue), no relleno sólido.
- [ ] Cambiar de filtro sigue funcionando (Todo / Libros / Películas / Series /
      Solo reseñas) y la URL conserva los parámetros.
- [ ] Las cards: avatar más pequeño (34px) + **"usuario verbo"** + tiempo
      **relativo** en mono a la derecha ("hace 2 horas", "ahora mismo"…).
      Recarga: no debe haber warning de hidratación en consola.
- [ ] El ítem ya **no va en caja gris**: portada 52×78 con sombra + título
      serif en color de texto (sin tinte por tipo).
- [ ] En reseñas de **libros** aparece el **autor en itálica** bajo el título.
      Películas/series no muestran línea de autor.
- [ ] Un evento **"añadió a su biblioteca"** muestra **punto de color de
      estado + etiqueta** ("Pendiente", "En curso"…) con el estado real de esa
      entrada.
- [ ] Likes/comentarios siguen funcionando y el pie va separado con línea.
- [ ] "Cargar más" pagina sin duplicar eventos.

## 2. Perfil · Cabecera (`/u/tuusuario`)

- [ ] Avatar 60px; **nombre en Fraunces** con **@usuario en mono debajo** (ya
      no en la misma línea).
- [ ] Botón Editar (propio) / Seguir (ajeno) arriba a la derecha.
- [ ] Debajo: **"N seguidores · M siguiendo"** con separador `·` (los dos
      siguen siendo enlaces).
- [ ] La bio va **después** de los counts.
- [ ] Chips con **punto de color** por tipo (sin iconos) + chip "Desde {año}"
      en muted sin punto.

## 3. Perfil propio · Panel

- [ ] La nota "Solo tú ves este panel…" es una caja con **borde, fondo
      terracota tenue y punto naranja** (ya no gris mono).
- [ ] **"Ahora mismo"**: tira horizontal de mini-cards **verticales** (portada
      2:3 de ~100px + barrita de progreso + título serif + progreso en mono).
      Libro/serie enlazan a registrar sesión; película a su ficha.
- [ ] Card **"Lectura esta semana"**: título serif + **total semanal en mono a
      la derecha** ("3 h 40 m", o "N min" si <1h). Barras + anillo diario
      como antes. Sin doble marco.
- [ ] Grid de dos cards: **"Racha"** (número grande terracota + "días · mejor
      N") y **"Meta libros"** (anillo **verde** con completados/objetivo; sin
      objetivo → cifra grande + "completados este año").
- [ ] Card **"Objetivos {año}"**: fila por tipo con punto de color + "36/50"
      en mono + mini barra teñida por tipo (sin meta: solo el recuento y la
      barra vacía). Debajo del divisor, el formulario de objetivos; **guardar
      sigue funcionando** y refresca las filas.
- [ ] Ya **no hay gráfico anual en el Panel** (vive en Actividad).
- [ ] Card **"Calendario"**: nav mono "‹ julio 2026 ›"; días con actividad en
      **fondo terracota tenue** (miniatura de portada si la hay), **hoy con
      anillo** terracota. Navegar a mes anterior/siguiente sigue funcionando.
- [ ] La sección de **Retos** sigue al final, intacta.
- [ ] Visitante: la pestaña Panel no aparece y `?tab=panel` por URL no la abre.

## 4. Perfil · Colección

- [ ] Sin filtros: arriba **"Continuar"** (cards con **banda de color
      izquierda** por tipo, kicker mono "LIBRO/SERIE/PELÍCULA", progreso y
      **"Continuar ›"** en el color del tipo) y el **Resumen** (total, barra
      apilada, chips por tipo).
- [ ] Con cualquier filtro activo (tipo, estado o búsqueda), Continuar y
      Resumen **desaparecen**.
- [ ] Las pills de tipo llevan **punto de color**.
- [ ] En la rejilla, el estado sobre la portada es ahora **solo un punto** de
      color (title/aria con el nombre del estado).
- [ ] Lo mismo en la colección de un **visitante** (`/u/otro?tab=coleccion`).
- [ ] `/coleccion` (tu biblioteca) sigue mostrando Continuar + Resumen en
      General — mismos componentes, ahora con banda/kicker/›.

## 5. Perfil · Actividad (propia y de otro)

- [ ] Orden nuevo: card **"Actividad este año"** (gráfico apilado + leyenda) →
      **"Destacados"** (eyebrow mono + rejilla de favoritos) → **"Reseñas
      recientes"**.
- [ ] Ya no aparecen aquí ni "Ahora mismo" ni las 3 tarjetas de recuento (los
      números viven en los chips de la cabecera).
- [ ] "Reseñas recientes" muestra hasta 3 reseñas del perfil **sin repetir
      avatar/nombre**: cabecera "reseñó · hace N días". Con rating, dots; el
      pie de likes/comentarios funciona (como visitante logueado puedes dar
      like).
- [ ] Un perfil sin reseñas no pinta la sección.
- [ ] Perfil privado que sigues: Actividad carga; perfil privado que NO
      sigues: stub de privado como antes.

## 6. Regresiones rápidas

- [ ] Campana de notificaciones: los tiempos relativos siguen saliendo bien
      (mismo helper nuevo).
- [ ] Compartir actividad a un club sigue renderizando la tarjeta (usa los
      campos nuevos de FeedEvent).
- [ ] Modo oscuro: feed, panel, colección y actividad legibles (tokens, sin
      hex nuevos).
