# Biblioteca — favoritos equivalentes e iconos de herramientas

> **[Histórico · congelado el 2026-10-07]** Corrección solicitada por el usuario.
> Sustituye el reparto principal/miniaturas y los iconos de herramientas de la
> spec inicial; los contratos actuales están en `docs/UI-GUIA.md` y `DESIGN.md`.

## Favoritos del mismo nivel

Todos los favoritos de `LibraryHighlights` usan la misma tarjeta y mantienen
el orden recibido. Tres columnas desde 320 px; cubierta 2/3 de 64 px bajo
360 px, 80 px de 360 a 639 px y 96 px desde 640 px; título, subtítulo opcional
y estado, incluido
«Al día». No se destaca una obra con un tamaño mayor que las demás. El panel
usa padding de 16/20/24 px en esos tramos y separación horizontal de 12 px en
móvil, 24 px desde 640 px, para contener los tres favoritos en una sola fila.

Cada tarjeta ofrece «Ver ficha». Cada libro/serie en curso con pase activo no
vacío recibe además «Registrar sesión»; se recorta el identificador antes de
construir su destino. Cine sigue registrándose desde la ficha. No se añaden
consultas ni caché. El contraste inverso se comparte entre todos los favoritos
y el esqueleto conserva esta rejilla. «Ver ficha» tiene ancho de contenido,
fondo transparente y borde de tinta al 60 %, con altura mínima de 44 px.
Todas las tarjetas reservan el mismo bloque de acciones de 92 px.

## Herramientas con iconos SVG pixelados

`LibraryToolIcon` ofrece tres glifos de código nativo en rejilla `16 × 16`, a
32 px con `shapeRendering="crispEdges"`: cuaderno de anillas, diana y barras.
Usa tokens Paper de tinta/superficie/acento y colores de tipo. Los iconos son
decorativos; los enlaces conservan Cuaderno, Retos y objetivos y Estadísticas
con sus mismos destinos. No se usan PNG de mascota ni se genera un bitmap.
Es una excepción local al set mono; no cambia la iconografía general.

## Entrega

Candidato de la PR #1435. No modifica esquema, APIs, RLS, consultas o caché ni
acredita merge/despliegue. La evidencia se añade como delta al
[informe de Biblioteca material](../../testing/2026-10-06-biblioteca-material.md).
La [spec inicial](2026-10-06-biblioteca-material-design.md) permanece congelada.
