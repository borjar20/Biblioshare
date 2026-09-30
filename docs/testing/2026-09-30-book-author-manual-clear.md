# Vaciado manual de autor de libro — #870

> **[Evidencia de ejecución · local, dev y prod verificados el 2026-09-30]**

La migración `20260930190000_book_author_manual_clear.sql` distingue un autor
que nunca se conoció de uno que una persona ha retirado deliberadamente. Al
cambiar `books.author`, el trigger guarda `repr_meta.author.source='manual'`,
incluso si el nuevo valor es `NULL` o `''`. `hydrate_book` y
`hydrate_books_bulk` mantienen el fill-only, pero consultan ese centinela antes
de rellenar: una entrada ausente continúa siendo desconocida e hidratable.

La migración conserva firmas, `SECURITY DEFINER` y roles de los hidratadores.
Las tres funciones redefinidas fijan `search_path=''`; EXECUTE queda efectivo
solo para `service_role` (`anon=false`, `authenticated=false`). No añade
columnas, políticas, grants de columnas, datos de catálogo ni backfill.

## Comprobaciones

`supabase/tests/book_author_manual_clear.sql` corre dentro de una transacción y
termina con rollback. Cubre curación de colaborador a `NULL` y vacío, valor
manual no vacío, rechazo a usuario ordinario, hidratación individual y en lote,
autor desconocido que sí se rellena, ACL y `search_path` de los tres objetos.

| Entorno | Resultado |
| --- | --- |
| Local | Bootstrap Node 24: 7/7 PASS. Replay limpio: 269 pasos; gate DB completo y concurrencia PASS. |
| Dev | Migración aplicada y SQL transaccional PASS con rollback. |
| Prod | Migración aplicada después de dev. Se verificaron definiciones, ACL y comentarios de los tres objetos; no se insertaron fixtures ni se modificó curación. |

Después de aplicar, los hashes de definición coinciden entre dev y prod:
`hydrate_book` `c81f64d6fb516824583f8e1b63af5658`,
`hydrate_books_bulk` `ad02c6523e072e800a0532a5c4db50e6` y
`stamp_repr_manual_on_curation` `c22ebc0249abf22228d7406cea522ace`.

La comprobación no revalida toda la cadena de representación. La guarda UUID de
`hydrate_books_bulk` ya estaba en dev y producción antes de #870; esta entrega
no la introduce ni la atribuye a la incidencia.
