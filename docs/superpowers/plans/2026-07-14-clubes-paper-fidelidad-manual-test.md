# Checklist manual — Pasada de fidelidad Paper en clubes

Cierra los gaps entre las vistas de clubes y los mockups del handoff
(`Paper - Clubes.html` y `Proponer actividad (standalone).html`). Todo es
presentación salvo dos ampliaciones de lectura: `getClub` ahora devuelve
`memberCount` y `getActivity` una muestra de participantes para el stack de
avatares.

## Preparación

`npm run dev`, login con `devtest`. Sirve cualquier club del que seas dueño;
para las partes de "Descubrir" hace falta al menos un club público del que NO
seas miembro (créalo con otra cuenta si no hay).

## 1. Lista de clubes (`/clubes`)

- [ ] El título **"Clubes"** va en Fraunces y el botón **Crear club** es el
      primario terracota, a su derecha.
- [ ] El **buscador está arriba del todo**, antes de "Tus clubes" (filtra la
      sección Descubrir, como antes).
- [ ] "Tus clubes" y "Descubrir" son **eyebrows** (mono, mayúsculas, pequeñas).
- [ ] Cada tarjeta tiene ahora una **banda de portada** arriba:
  - [ ] Con imagen si el club tiene portada.
  - [ ] Sin imagen: **rayas diagonales** de color. **Recarga la página**: el
        mismo club debe pintar SIEMPRE las mismas rayas (salen del id, no del
        azar — si cambian al recargar, es un bug de hydration).
- [ ] Chip **"Público" / "Privado"** (con candado) flotando sobre la banda.
- [ ] Pie de tarjeta: **"N miembros"** en mono; si hay novedades, **punto
      naranja** + "· M novedades".
- [ ] En "Tus clubes" el botón es **Abrir** (contorno); en "Descubrir", el de
      un club público es **Unirse** en **verde**; el de un privado,
      **Solicitar unirse** en contorno.
- [ ] Pulsa Unirse en uno público: entra sin recargar y el botón desaparece.

## 2. Cabecera del club (`/club/[slug]`)

- [ ] **Banner** siempre presente (imagen o rayas — mismas reglas que la
      tarjeta, y las mismas rayas que su tarjeta del listado).
- [ ] Nombre en Fraunces grande; debajo, línea mono con **candado + "Privado"**
      (solo si es privado) **· "N miembros"** (nuevo: sale de `club_stats`,
      también para no-miembros de clubes públicos).
- [ ] La descripción va debajo, en gris.
- [ ] Botones a la derecha: **Salir** (contorno) si eres miembro no-dueño,
      **Editar** (fantasma) si moderas. Con una invitación pendiente:
      **Aceptar invitación** en verde.
- [ ] La pestaña **Gestión lleva la marca ◈** (solo la ven moderador/dueño).

## 3. Feed: strips horizontales

- [ ] "Actividades activas" es ahora un **carrusel horizontal** de tarjetas
      (se desliza de lado si hay varias): chip de tipo con su color, título
      serif y línea mono con "N participan".
- [ ] Si la actividad tiene **fechas de inicio y fin**, la tarjeta lleva una
      **barra de progreso temporal** (cuánto del periodo ha pasado) y
      "· hasta {fecha}". Sin fechas, no hay barra.
- [ ] "Próximos hitos" es otro strip: **día grande en serif + mes en mono** a
      la izquierda, hito y actividad al lado.
- [ ] Cada tarjeta de ambos strips **navega a su actividad**.
- [ ] Sin actividades ni hitos, el bloque no aparece.

## 4. Detalle de actividad

- [ ] Arriba, **chip tipo · estado** con el color del tipo (terracota lectura,
      oro tierlist, teal reto de lista, verde reto genérico).
- [ ] Título en Fraunces grande; descripción en gris.
- [ ] **Stack de avatares solapados** (máx. 4) + burbuja **"+N"** si hay más
      + "N participan".
- [ ] A la derecha de esa fila: **Unirse** (verde) o **Salir** (contorno).
      Al unirte/salir el stack y el contador **se actualizan sin recargar**.
- [ ] Si moderas, las acciones **Activar / Finalizar / Archivar** van en su
      propia fila, compactas.
- [ ] **Opiniones**: cada ítem es una card Paper con título serif; las
      opiniones ajenas llevan **avatar**; valoración y comentario usan los
      inputs del design system.

## 5. Pestaña Actividades

- [ ] El botón **"+ Proponer actividad"** es primario y **a ancho completo**,
      arriba del todo.
- [ ] Grupos con contador en el eyebrow: "Activas · N" y
      **"Propuestas · esperan moderación · N"**.
- [ ] Las tarjetas de **propuestas** llevan **tinte dorado** (borde y fondo).
- [ ] **Aprobar** en verde, Rechazar en contorno (solo moderadores).
- [ ] Las **Finalizadas** se ven **atenuadas**.

## 6. Gestión

- [ ] Solicitudes de entrada: **Aceptar** en verde. (El e2e ancla en
      `data-testid="join-request"` — sigue presente.)
- [ ] Miembros: eyebrow **"Miembros · N"** con botón **"+ Invitar"** a la
      derecha; el formulario de invitación **aparece al pulsarlo** (antes
      estaba siempre visible).
- [ ] Cada fila lleva **avatar** y **chip de rol**: Dueño en terracota,
      Moderador en verde, Miembro en gris.
- [ ] Las acciones por miembro (ascender, expulsar, transferir) siguen
      funcionando.
- [ ] **Prueba de seguridad**: como miembro raso, `…?tab=gestion` NO enseña la
      gestión.

## 7. Transversales

- [ ] **Modo oscuro**: revisa especialmente los botones verdes (texto legible),
      los chips de rol y el tinte dorado de las propuestas.
- [ ] Móvil (~400 px): los strips del feed se deslizan sin desbordar la
      página; las tarjetas de club no rompen.
- [ ] Deuda consciente (no son bugs): las pestañas del club siguen en **mono**
      (convención de la app; el mockup las pinta serif) y **no hay sticky** en
      topbar/pestañas (fuera de alcance de esta pasada).
