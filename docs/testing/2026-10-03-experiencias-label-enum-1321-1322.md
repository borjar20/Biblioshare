# Etiqueta de Experiencias y constante de clubes — #1321/#1322

> **[Verificación local · contra código el 2026-10-03]**

[#1321](https://github.com/borjar20/Biblioshare/issues/1321): `PostAside` consume
`social.relatedKind.${p.kind}`. Para `experience` faltaba la traducción y aparecía
la clave cruda. `messages/es.json` añade únicamente
`social.relatedKind.experience = "Experiencia"`.

[#1322](https://github.com/borjar20/Biblioshare/issues/1322): el array runtime
`Constants.public.Enums.club_post_kind` contenía los valores de `post_kind`.
`src/lib/supabase/database.types.ts` restaura sólo esa línea a
`["text", "activity_share", "poll"]`, de acuerdo con su unión TypeScript y
`supabase/migrations/20260712_club_posts.sql`. La unión y el SQL ya eran correctos;
no cambia el esquema ni se añade una migración. `post_kind` y `mentioned`
permanecen intactos.

| Verificación | Baseline | Corregido |
|---|---|---|
| `PostAside` real, proveedor next-intl y catálogo reales, DOM/jsdom | Experiencia FAIL por clave ausente; Pensamiento PASS | 2/2 PASS: etiqueta exacta, enlace al post, sin clave cruda ni errores i18n |
| Comparación AST de las 29 uniones de enum con sus arrays runtime | Única divergencia: `club_post_kind`; unión y SQL coinciden | 29/29 PASS |
| Revisión focal i18n | FAIL inicial del arnés al comparar blob LF con archivo CRLF, conservado | 12 checks PASS en `receipt-r2.json`; sólo se normaliza CRLF→LF para comparar |
| Typecheck completo, Node 24.19.0, `--noEmit --incremental false` | — | PASS, exit 0 sobre base `1d1f61867dac7ba076d9e6dd940e6fbbbf34fbc3` con ambas correcciones |

Los resultados DOM/AST existentes no se repitieron. Sus fuentes y artefactos
conservan los hashes revisados. Tras actualizar la rama desde `a0b0e031` a
`1d1f6186`, los archivos corregidos conservaron también sus hashes físicos; la
comparación del texto normalizado acredita exactamente la clave nueva y la
sustitución del único array. No modifica contenido al normalizar finales de línea.

Evidencia causal original:
`.scratch/ticket-campaign/20261002-resolve-all/experience-followups-1321-1322-20261003/`
(resultados/logs DOM, `enums-baseline.json`, `enums-fixed.json` y revisión i18n).
Preparación de entrega:
`.scratch/experience-followups-publication-20261003/`
(fuentes selladas, comparación de alcance, typecheck y recibo del commit).

Esto verifica DOM/jsdom, contratos estáticos y tipos. No verifica navegador
nativo, navegación completa, BD, RLS o datos desplegados. No se iniciaron
servicios ni se ejecutaron builds o migraciones. Antes del merge, la PR debe
superar los checks de CI del **HEAD exacto** que contiene estos cambios.
