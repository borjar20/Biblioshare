# #897 — cobertura de reevaluateRepresentation

[Histórico · verificado por pruebas locales el 2026-10-03 · sin DB/proveedores reales]

Se añade `src/lib/catalog/edit-actions.representation.test.ts`, con **18 casos** sobre la acción pública. No se exportan privados ni se modifica producto.

La acción, `getCurrentUserRole`/`hasMinRole`, `ensureBookHydrated`, la política de representación, el mapeo de géneros y los builders del SDK Supabase instalado son reales. Las fábricas de clientes devuelven dos instancias del SDK con fetch local separado; sesión, respuestas de proveedores, redirect e invalidación de Next son fronteras controladas. No se lee env ni se usa una clave real.

## Qué protege

- Autenticación y gate colaborador/admin antes de cualquier reset; usuario normal, rol ausente, sesión ausente e identidad inválida no escriben.
- Un libro reciente y completo, que normalmente no necesita revisión, vuelve a hidratarse al recibir `hydrated_at:null`. El PATCH de `books` lleva cliente de petición, filtro de UUID, selección completa y retorno singular real del SDK.
- El pegamento sigue hasta POST `hydrate_book` con el cliente construido por `createServiceRoleClient` dentro del helper real. Se comprueban identidad, autor y propuesta derivada de los proveedores; ninguna RPC de hidratación sale por el cliente de petición.
- La acción espera el gate de rol, la respuesta del reset y el asentamiento de la hidratación. Sólo después invalida `book/id` y devuelve éxito.
- Error o fila ausente en reset detienen el recorrido. Proveedor caído/ausente, error de RPC, rechazo de su transporte y fallo de construcción del cliente de sistema mantienen éxito del reset e invalidación; los fallos que el helper registra dejan el diagnóstico esperado.

## Controles causales y checks

Cinco mutaciones **en memoria** del módulo real producen un FAIL de aserción cada una: quitar gate, usar service para el reset, usar request para hydrate_book, omitir await de hidratación y conservar el sello hydrated_at. Cada ejecución filtra un caso y declara los otros 17 omitidos. No se escriben las fuentes de producto; sus hashes se comprueban antes y después.

| Check | Resultado |
|---|---|
| Nuevos casos de acción | 18 PASS / 1 archivo |
| Focal con hydrate-book y enrich-item-book existentes | 104 PASS / 3 archivos |
| Controles mutantes | 5 FAIL causales esperados / 5 ejecuciones |
| Tipos completos con Node24 | PASS |
| Lint del test añadido | PASS |
| Whitespace y alcance del commit | Verificados antes del commit propio |

Las invocaciones exactas, snapshots, logs, JSON, restauración por hashes y recibos están en la evidencia de raíz `.scratch/ticket-campaign/20261002-resolve-all/catalog-representation897-20261003`. CI sobre el HEAD final de la PR es un gate de publicación, no un resultado de este informe.

## Límites y matiz de la issue

Estas pruebas no acreditan cookies/RSC/POST de Next, caché por petición, SQL, grants, triggers, RLS ni proveedores nativos. El error 42501 del cliente request hacia la RPC es una respuesta controlada coherente con los grants canónicos; no se consultó una base real. La selección fill-or-upgrade y la curación dentro de la RPC siguen perteneciendo a pruebas SQL.

El body antiguo de #897 no describe completamente el primer cliente: el trigger canónico 20260878 permite la vía de sistema cuando `auth.uid() IS NULL`. Por ello el control service-reset detecta la identidad de cliente equivocada sin inventar un rechazo SQL para ella. Se fija el contrato actual del código: reset con sesión, hidratación privilegiada dentro del helper.

Cero servicios, build, navegador, DB, DDL, dependencias o cambios de env. Las otras acciones de edit-actions quedan fuera de estos 18 casos; el título de esta cobertura identifica sólo reevaluateRepresentation.
