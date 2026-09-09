# Referencia visual para prototipos

> [Canónico · verificado contra `src/app/globals.css` y las capturas el 2026-08-04;
> excepción de mascota verificada en código y navegador el 2026-09-09]

Este es el punto de partida para cualquier prototipo funcional nuevo de
Biblioshare. Manda para las **capturas de referencia** y el **flujo de
prototipado**. El código y `globals.css` mandan si algo difiere de esta guía.

> **Desde el 2026-08-27, los tokens viven en [`DESIGN.md`](../DESIGN.md)** (raíz del repo):
> valores de color con su pareja clara/oscura, los cinco papeles tipográficos, la escala de
> forma, las dos sombras, los cuatro shells y los primitivos, cada uno con el porqué medido.
> El resumen de «Sistema Paper» de más abajo se queda como orientación rápida; cuando los dos
> difieran, manda `DESIGN.md` — y si `DESIGN.md` difiere de `globals.css`, manda `globals.css`.

## Referencias de pantalla

### Mascota RPG (2026-09-09)

Dirección aprobada en
`docs/superpowers/specs/assets/2026-09-09-mascota-rpg-ui/`: las láminas
`campamento-combate-mochila.png` y `personaje-diario-madriguera.png` definen la
composición. Son mockups, con nombres/cifras ilustrativos; el catálogo real manda.
Tema bosque fijo en ambos temas de Biblioshare, marcos finos y acceso permanente
«← Biblioshare». Los fondos elegidos viven en `public/pet/scenes/` con procedencia
PixelLab en `provenance.json`; nunca incrustar los controles o personajes del mockup
en el fondo. Contrato: spec `2026-09-09-mascota-rpg-ui-design.md`.

**Revisión estética (PR #1166).** Cuatro escenas, no dos: `camp.webp` (576×448,
escritorio), `camp-portrait.webp` (288×384, móvil), `battle.webp` (563×448, arena)
y `gathering.webp` (576×432, Madriguera). **Se sirven a 2× o 3× exactos con
`background-size` en píxeles, jamás con `cover`**: un factor fraccionario con
`image-rendering: pixelated` produce píxeles de anchura desigual y el arte deja de
leerse como pixel art. Los materiales de interfaz —tres marcos de nueve cortes y el
tablón de madera en sus tres estados— viven en `public/pet/ui/` con su propia
procedencia y sus recortes medidos. Los tokens y las reglas de forma, en `DESIGN.md`,
«Excepción de la mascota».

Las capturas fuente viven fuera del repositorio en
`D:\Proyectos\Personal\Imagenes diseño`. Se consultan antes de crear un
prototipo de una zona equivalente; no se copian al repo para no duplicar unos
archivos de trabajo que ya son la referencia visual del producto.

| Zona | Escritorio | Móvil |
| --- | --- | --- |
| Inicio | `inicio.jpg`, `inicio_claro.jpg` | `inicio movil.jpg`, `inicio movil2.jpg` |
| Colección | `coleccion_todo_filtros.jpg`, `colecion_colecciones.jpg`, `coleccion saga.jpg` | `coleccion todo filtro movil.jpg`, `coleccion colecciones movil.jpg`, `coleccion saga movil.jpg` |
| Búsqueda | `buscar.jpg`, `buscar 2.jpg` | `busqueda movil.jpg` |
| Ficha de obra | `ficha info.jpg`, `ficha comunidad.jpg`, `ficha registro.jpg` | equivalentes `ficha * movil.jpg` |
| Clubes y actividades | `club_feed.jpg`, `club_actividades.jpg`, `actividades *.jpg` | `club feed movil.jpg`, `actividades movil.jpg`, `lectura conj movil.jpg`, `retolista movil.jpg` |
| Sagas | `saga.jpg`, `saga mapa.jpg`, `saga mapa 2.jpg` | `saga * movil.jpg` |
| Perfil y sesión | `perfil estadisticas.jpg`, `perfil rincon.jpg`, `registrar sesion.jpg` | — |

Las capturas de escritorio rondan 2520×1230 px; las de móvil, 945×2048 px.

## Sistema Paper

- **Tono:** editorial, cálido y sobrio; las portadas aportan la mayor parte del color.
- **Fondo y superficies:** papel cálido en claro (`--background: #f3ece1`) y espresso en oscuro (`#1f1a16`). Las tarjetas se separan con una elevación leve, nunca con brillos fríos.
- **Tipografía:** Fraunces para titulares y secciones; Geist sans para lectura de interfaz; Geist Mono para etiquetas, metadatos y controles compactos.
- **Acento principal:** terracota (`--accent`), con oro para progreso/logros, verde para completado, teal para películas y violeta para series.
- **Forma:** chips de 6 px, portadas de 10 px y tarjetas de 14 px. Sombras contenidas (`--shadow-card`, `--shadow-cover`).
  Los radios de Tailwind **apuntan a esa escala**, no a sus valores de fábrica: `rounded-md`=6, `rounded-lg`=10,
  `rounded-xl`=`rounded-2xl`=14. Escribir `rounded-lg` es legítimo y cae en la escala; lo que no vale es un
  `rounded-[9px]` nuevo. `rounded-sm` (4 px) se sale de la escala a propósito: es el detalle diminuto, no una caja.
- **Iconos:** línea redondeada, monocromos y con `currentColor`; no emojis.
- **Rótulo de sección:** la utilidad `label-section` (mono 10 px, `0.12em`, muted, mayúsculas). No se vuelve a escribir
  a mano la combinación `font-mono … uppercase` para encabezar un bloque; llegó a haber quince variantes.
- **Error:** `text-status-dropped`. `text-destructive` **no existe** y computa igual que el texto normal.
- **Foco de teclado:** lo pone `globals.css` para toda la app (`:focus-visible` → anillo de acento 2 px, offset 2 px).
  No hace falta añadirlo por componente, y un `focus:outline-none` suelto ya no lo apaga.
- **Cabecera de página:** `ui/page-header.tsx` (barrita de acento + Fraunces + acción opcional). Un `<h1>` suelto con
  su propio tamaño es deriva.

Los nombres y valores completos de los tokens están en
[`src/app/globals.css`](../src/app/globals.css). Se usan tokens de Tailwind
(`bg-surface`, `text-foreground-soft`, `text-accent`, etc.), no valores de color
inventados en cada prototipo.

## Reglas de composición

- **Móvil primero:** reproduce la jerarquía compacta de las capturas; topbar simple y tabbar inferior fija con cinco destinos.
- **Escritorio aprovecha el ancho:** topbar horizontal, contenido principal y rail lateral sticky o grids amplios. No estirar una columna móvil en un monitor.
- **Jerarquía:** encabezado serif, etiquetas mono en mayúsculas y contenido principal legible, con espacio en blanco generoso.
- **Tarjetas:** una acción principal clara; estados y metadatos son secundarios. El acento se reserva para progreso, selección y CTA.
- **Tema:** cada prototipo debe funcionar en claro y oscuro; no se deben introducir colores hardcodeados que rompan el segundo tema.

## Flujo de prototipado funcional

1. Consultar esta guía y la captura de la zona más parecida.
2. Proponer el flujo y los estados de la funcionalidad antes de implementar.
3. Crear una ruta o estado de demostración con datos ficticios dentro de la app, reutilizando componentes y tokens existentes cuando encajen.
4. Revisar en móvil y escritorio; tras la aprobación, decidir si se conecta a datos reales.
5. Si se fija una nueva regla visual reutilizable, actualizar este documento y `globals.css` o el componente base correspondiente.

## Mantenimiento

Al cambiar el sistema de color, tipografía, navegación, escala de forma o una
referencia de pantalla relevante, actualizar esta guía y su fecha de
verificación. Si se mueve la carpeta externa de capturas, actualizar su ruta
aquí antes de continuar con prototipos.
