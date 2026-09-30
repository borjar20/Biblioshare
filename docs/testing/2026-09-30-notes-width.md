# Ancho del Cuaderno a 390 px — #745 / #755

> **[Evidencia de ejecución · navegador focalizado en dev el 2026-09-30]**

Los tickets #745 y #755 duplicaban el overflow horizontal de `/notas` a 390 px.
La corrección ya estaba en el código actual: el contenedor puede encogerse
(`min-w-0`) y el input ocupa el ancho disponible (`w-full`). Su referencia
original es la issue [#833](https://github.com/borjar20/Biblioshare/issues/833),
cerrada el 2026-08-26.

## Comprobaciones

Navegador real con Next 16.3.0 y la guarda #895, a `390×700`:

- Overflow inicial `0`; el borde derecho de Buscar quedó en `374 ≤ 390`.
- Tras buscar y activar una etiqueta, overflow `0`; los controles siguieron
  utilizables y la nota privada propia continuó visible.
- `consoleErrors=[]`, `pageErrors=[]`, `failedRequests=[]`.
- La captura `notas-390-after-search.png` confirma chips, texto largo y formato
  sin scroll horizontal.

La prueba creó y eliminó una única fixture propia mediante SDK y RLS, sin tocar
libros, pases ni otras notas. La limpieza comprobó el id, usuario y cuerpo de la
fixture; una consulta independiente en dev dejó `own_note_remaining=0`.

El primer intento falló porque el locator contaba dos enlaces; fue un fallo del
test, no del producto. No se añade otro test: `e2e/notas-cuaderno` ya cubre el
viewport de 390 px. Esta evidencia es una comprobación focalizada del Cuaderno,
no una campaña completa de interfaz.
