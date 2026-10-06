# Biblioteca material — Paper

> **[Histórico · congelado el 2026-10-06]** Diseño aprobado e implementación
> local. Los patrones actuales los manda `docs/UI-GUIA.md`, los tokens
> `DESIGN.md` y la entrega la evidencia de pruebas.

## Alcance aprobado

Dar materialidad a `/coleccion` reutilizando sus rutas, datos y controles:
libros con lomo/canto estrecho, cine y series como carteles; títulos, nota y
estado debajo. `LibraryItemCard` ofrece `presentation="material"`, opt-in
desde Biblioteca, y conserva su presentación por defecto para el perfil.

El libro añade su canto sin duplicar la silueta ni sumar otra portada. Portada
y controles comparten una subida de 3 px con ratón de puntero fino; foco,
táctil y `prefers-reduced-motion` dejan el objeto quieto. Favorito y añadir a
colección permanecen fuera del enlace, con su comportamiento optimista y
áreas táctiles existentes.

## Composición y datos

Resumen y Destacados se apilan en móvil y forman dos columnas desde 1024 px.
Resumen usa 280 px, 320 px desde 1280 px. Sin favoritos se presenta solo.
`LibraryHighlights` es un componente de servidor que recibe los favoritos
actuales: el primer pin ocupa el panel, los demás permanecen visibles y en
orden. El panel invierte el contraste desde la paleta Paper. «Añadir sesión»
requiere libro o serie en curso con pase activo; siempre existe enlace a ficha.

La barra de Resumen mantiene la proporción de los estados reales, sin simular
un objetivo. Los accesos siguen siendo Cuaderno, Retos y objetivos y Estadísticas;
notas/misiones reutilizan sus PNG pixel existentes a 32 px. Las pestañas Todo /
Colecciones / Sagas y sus filtros/paginación conservan su contrato. Los esqueletos
se adaptan a la composición. La barra sticky de filtros conserva su propio
recorrido, sin un nuevo wrapper que lo recorte.

## Excepción a Paper aprobada

El usuario aprobó los cantos de contacto y los radios locales de esta vista:
3 px bajo Resumen/colecciones, 1 px bajo herramientas, 4 px bajo Destacados;
«Añadir obra» de al menos 44 px con relieve 2 × 3 px y radio `7/7/2/7`;
acciones del destacado de 6 px, cubiertas y miniaturas de 3 px, buscador de 8 px
y subrayado activo escalonado de 5 px. Son estilos acotados, no tokens nuevos
ni una tercera elevación global. Las sombras `card`/`cover`, colores y fuentes
de Paper se reutilizan en `library-view.module.css`,
`library-item-card.module.css` y `library-highlights.module.css`.

## Entrega y límites

No hay cambios de esquema, APIs, RLS, consultas o caché, ni nuevos sprites o
una mascota adicional. Se conserva el modelo de datos privado por petición.
La implementación y esta spec no acreditan merge ni despliegue.
[Verificación local](../../testing/2026-10-06-biblioteca-material.md).
