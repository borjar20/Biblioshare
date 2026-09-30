# Alta por identificador de Google Books — #924

> **[Evidencia de ejecución · verificada en local, dev y prod el 2026-09-30]**

La función real solo rechazaba NULL o vacío después de `btrim`. El RED local
confirmó que tanto una cadena con puntuación como otra de 5000 caracteres
acuñaban una shell. Todas las pruebas usan datos sintéticos y rollback.

El límite elegido es del proyecto: 1–256 caracteres ASCII URL-safe después
de recortar espacios exteriores. Google define un ID de cadena única, sin
publicar una longitud o gramática obligatoria en las referencias consultadas.
Fuentes primarias: [IDs de Google Books](https://developers.google.com/books/docs/v1/using#GoogleBooksIDs)
y [Volume: get](https://developers.google.com/books/docs/v1/reference/volumes/get).

| Comprobación | Resultado |
|---|---|
| Preflight de IDs existentes | Dev: 4; prod: 34. Máximo 12 caracteres; cero fuera del alfabeto o del límite 256. |
| Regresión local | 19/19 PASS: NULL/vacío, espacios interiores, controles, URL, punto, no ASCII, 257/5000, límites 1/256, guion/subrayado, idempotencia y trim. Los rechazos exigen SQLSTATE y mensaje concretos. |
| ACL efectiva | Anon sin EXECUTE; authenticated y service_role conservan EXECUTE. |
| Generador | 7/7 PASS, sin skips. |
| Replay vacío | 266 pasos; gate DB completo PASS, incluidos contratos por rol y concurrencia. |
| Dev | Migración aplicada después de local; misma matriz de 19 pruebas PASS con rollback. |
| Prod | Aplicada después del gate dev; `pg_proc` confirma los dos guards, SECURITY DEFINER, search path y ACL. Sin escrituras de prueba. |

La matriz se ejecuta desde `scripts/db/verify.mjs` y la migración está en el
manifiesto y baseline, por lo que CI vuelve a probarla en una instancia vacía.
La revisión independiente confirmó compatibilidad de firma, cuerpo de alta y
grants. SHA-256 del SQL en el checkout verificado:
`79d27d0665dbcc1a3535fc5a9698608e5a1aa4c2e2b105374626b1ee8664da1c`.

Este filtro no demuestra que Google conozca un ID ni limita cuántas cadenas
admisibles puede registrar una cuenta. La prueba local de 101 altas en una
transacción confirma ese límite separado, rastreado en #1237.
