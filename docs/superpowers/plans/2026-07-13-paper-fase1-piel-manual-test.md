# Checklist manual — Rediseño Paper, Fase 1 (la piel)

Esta fase **no cambia ninguna ruta ni ninguna navegación**. Todo lo que cambia
es color y tipografía. Si algo te lleva a otra pantalla distinta de la de antes,
es un bug.

Antes de la fase 1 la app era morada/rosa (`#ffe9fc` de fondo, acento ciruela
casi negro). Ahora debe verse **cálida y editorial**: papel (`#f3ece1`) con
acento terracota (`#b0542f`) en claro, y espresso (`#1f1a16`) con terracota
claro (`#d98a5c`) en oscuro.

## Preparación

1. `npm run dev`
2. Login en `/login` con la cuenta `devtest` (credenciales en `.env.local`:
   `TEST_USER_EMAIL` / `TEST_USER_PASSWORD`).
3. Ten a mano el toggle de tema (icono sol/luna en el header) — **cada punto de
   abajo hay que mirarlo en claro Y en oscuro**.
4. Abre en paralelo, para comparar, los mockups de referencia en
   `Biblioshare_mockups/Biblioshare/design_handoff_biblioshare_paper`
   (`Paper - Guía de estilo.html` y `Paper - Modo oscuro.html`).

## 1. Cambio de tema global

- [ ] Cualquier pantalla, modo claro: el fondo es papel cálido, **no** rosa. Los
      botones primarios son terracota, no ciruela.
- [ ] Modo oscuro: el fondo es marrón espresso, **no** morado. Los botones
      primarios son terracota clara.
- [ ] El texto sobre los botones primarios se lee con holgura en ambos modos
      (es el contraste `accent-foreground` sobre `accent`).
- [ ] El toggle de tema sigue funcionando y la elección persiste al recargar.
- [ ] No queda **ningún** resto morado/rosa en ninguna pantalla.

## 2. La rejilla de episodios — el punto más importante

Era el peor agujero: los 6 colores de la escala de notas estaban fijos en hex
(verdes y rojos oscuros) y **no tenían variante oscura**, así que sobre el fondo
espresso quedaban ilegibles. Ahora son tokens con variante clara y oscura.

1. Ve a una **serie** que tengas en biblioteca con episodios puntuados
   (`/serie/[id]` → pestaña **Episodios** → vista **rejilla**).
- [ ] **Modo claro**: cada celda con nota tiene color de tramo y su número se
      lee bien encima.
- [ ] **Modo oscuro**: lo mismo. Antes de este cambio las celdas eran verde/rojo
      oscuro casi negros sobre fondo oscuro — si ves eso, el arreglo no entró.
- [ ] La leyenda de abajo (Genial → Horrible) usa los mismos colores que las
      celdas, en ambos modos.
- [ ] Un episodio con reseña muestra su puntito; el punto se ve tanto en celdas
      con color como en celdas sin nota (hereda el color del texto de la celda).

## 3. Los otros 4 arreglos de color

- [ ] **Switch de notificaciones push** (ajustes / pie del panel de
      notificaciones): el knob se ve en los dos estados (encendido y apagado) y
      en los dos modos. Antes era blanco puro siempre.
- [ ] **Drawer de navegación móvil** (reduce la ventana a móvil → menú): el velo
      oscuro de detrás se ve correcto en ambos modos.
- [ ] **Calendario del mes** (home → panel), en su caja de error: fuerza un
      error cortando la red un momento y recargando el mes. El aviso debe salir
      en el rojo del tema (`status-dropped`), no en un rojo Tailwind crudo.
- [ ] **Icono de la PWA y barra del navegador**: en Android/Chrome la barra
      superior debe ser terracota, no ciruela. El icono "B" ahora es terracota
      con la letra en crema.

## 4. Tipografía (Fraunces)

Fraunces debe aparecer **mucho más** que antes. Es lo que da el carácter
editorial.

- [ ] **Títulos de ítem** en serif con peso semibold, y el **autor/subtítulo en
      cursiva serif**, en: tarjetas de la biblioteca (`/u/[tu-usuario]`),
      resultados de búsqueda (`/buscar`), "ahora consumiendo" (home), y
      portadas genéricas.
- [ ] **Título del ítem en las tarjetas del feed** (home → Siguiendo) en serif.
- [ ] **Cifras grandes en serif**: racha, tira semanal, stats anuales, tarjetas
      de stats del perfil.
- [ ] Los metadatos, contadores, fechas y etiquetas en mayúsculas **siguen en
      Geist Mono** (no deben haberse convertido en serif).
- [ ] El cuerpo de texto (sinopsis, reseñas) sigue en Geist sans.

## 5. Selects (refactor, no debería cambiar nada visible)

Los 9 `<select>` de la app pasaron a un componente común. Comprueba que siguen
funcionando y que no han cambiado de tamaño:

- [ ] Ficha de ítem → **Registro**: selector de estado y selector de cola
      (el de cola solo aparece con estado "pendiente"). Cambiar el estado guarda.
- [ ] Ficha de libro → **Registro** → panel de progreso: selector de formato.
- [ ] `/sesion/[entryId]`: selector de estado.
- [ ] `/retos` → nuevo reto: selector de tipo.
- [ ] `/admin` (si eres admin): selector de rol — es más compacto que los demás,
      debe seguir siéndolo.
- [ ] Club → proponer actividad: selector de tipo de actividad, y en un reto por
      criterios, los selectores de modo y de tipo.

## Nota sobre los tests automáticos

`npm run build` pasa (typecheck + lint). **`npm run test` no arranca**, pero no
es culpa de esta fase: falla igual en `main`. Es la versión de Node — tienes
v20.9.0 y vitest necesita ≥20.12 (usa `styleText` de `node:util`). Merece la
pena actualizar Node por separado.
