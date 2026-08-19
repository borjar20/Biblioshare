# Seguridad — modelo de permisos y excepciones

> **[Canónico · verificado contra dev (con diff a prod) el 2026-08-19]**
>
> Cómo se decide quién puede leer/escribir qué, dónde viven las barreras y qué
> excepciones conocidas hay. Fuente: fase 2 de la auditoría 2026-08
> (`docs/audit/AUDIT-2026-08.md`, hallazgos `S2-###`). El detalle por tabla/policy
> está en `docs/requirements/data-model.md`. Lo roto y pendiente vive en issues.

## El modelo en una página

1. **RLS en todo.** Las 55 tablas de `public` tienen RLS activa y al menos una
   policy. No hay tabla abierta.
2. **Roles de aplicación** en `profiles.role`: `user` → `collaborator` → `admin`.
   `role` está blindado en BD (trigger `enforce_role_change_admin_only` bloquea el
   UPDATE por no-admins; la policy de INSERT exige `role='user'`). El patrón de
   autorización del catálogo/curación es **doble barrera**: gate en servidor
   (`requireCollaborator`/`hasMinRole`) + gate en BD (trigger o policy con
   `has_min_role(...)`). Decisión 8-H.
3. **Visibilidad social**: el eje es `private.can_view_profile` (perfil público, o
   dueño, o seguidor aceptado) + `users_are_blocked` (bloqueos bidireccionales).
   Comentarios/reacciones exigen `can_view_interaction_target`.
4. **Transiciones sensibles solo por RPC** SECURITY DEFINER con gate de
   rol/ownership dentro (roles de club, transferencia de propiedad, aprobar
   solicitudes, pin, rondas, secuencia de saga). Regla: el gate de permisos va
   PRIMERO en el cuerpo de la RPC.
5. **Vistas identity** (`profile_identities`, `club_identities`, `club_stats`):
   SECURITY DEFINER **a propósito** — modelo Instagram: un anónimo puede ver
   nombre/avatar/bio de cualquier perfil y la existencia de clubes privados para
   las pantallas de «solicitar seguir/entrada». Son SOLO LECTURA (revoke ALL +
   grant SELECT). Es una decisión de producto registrada; sus dos flecos
   (descripción de club privado visible, bloqueos ignorados) están en revisión
   (S2-18, `tipo:acta` pendiente).
6. **Storage**: buckets `avatars`/`covers` públicos en lectura; la subida se
   valida en código (MIME allowlist jpeg/png/webp, tope 2 MB, path por
   `user.id`/UUID, content-type forzado) y las portadas oficiales además por
   allowlist de hosts. EXCEPCIÓN CONOCIDA: `uploadCover`/`uploadSagaCover`
   escriben con service-role y su única barrera es el gate TS previo (F1-012).
7. **Web**: cero `dangerouslySetInnerHTML` con datos de usuario y sin renderer de
   Markdown (sin sink de XSS); redirects validados (`safeNext`); export CSV sin
   IDOR. Búsqueda externa con hosts fijos (sin SSRF por ahí).

## Reglas que hay que conservar al tocar BD

- **Toda vista nueva nace `security_invoker` y con grants mínimos.** El defecto
  de Supabase concede ALL (incl. escritura) a `anon`+`authenticated` en cada
  relación nueva (#691): una vista recreada sin re-revocar vuelve a ser
  escribible. Este defecto es la raíz de los P0 de `pass_reviews`.
- **Todo SECURITY DEFINER lleva `search_path` con `pg_temp`** (plantilla de
  `20260808_secdef_search_path_pg_temp.sql`). A 2026-08-19 hay 15 funciones sin
  él (S2-19) — re-ejecutar el barrido al tocar BD.
- **Grants por columna**: varias tablas tienen grant fino; una columna nueva sin
  su grant rompe la escritura ENTERA de la tabla (issue #375, dos veces).
  Superficie 6 de `docs/DRIFT-CHECK.md`.
- **dev primero, prod después**; el ledger de migraciones NO es fuente de verdad
  — verificar contra `pg_proc`/`pg_class`.

## Excepciones y riesgos abiertos (estado 2026-08-19)

Rastreados en issues; aquí solo el mapa. Detalle y explotación: fase 2 del
informe de auditoría.

| Riesgo | Issue | Estado |
|---|---|---|
| Escalada user→admin en alta pre-onboarding | #689/#687 | **P0 abierto** |
| Escritura de reseñas ajenas vía vista `pass_reviews` (sin `security_invoker` + grants) | #690/#688 | **P0 abierto** |
| Backup real de prod (PII) trackeado en git | #677 | **P0 abierto** |
| Catálogo global insertable por cualquier autenticado — cerrado en dev, **abierto en prod** hasta desplegar la migración F de #674 | #674 | **P0 abierto** |
| Default privileges ALL a anon/authenticated | #691 | P1 |
| RPC sagas TMDB sin gate de rol | #675 | P1 |
| SSRF ciego vía endpoint de Web Push | #678 | P1 |
| DoS por `total_seasons` sin límite | #676 | P1 |
| INSERT arbitrario en `credits`/`people`/`series_episodes` (`with_check true`) | S2-05 (issue pendiente de abrir) | P2 |
| CSV formula injection en export | #681 | P2 |
| Sin security headers/CSP ni middleware | S2-08 (pendiente de abrir) | P2 |
| Sin rate limiting en toda la app | S2-11 (pendiente de abrir) | P2 |
| Trigger de curación no cubre columnas `openlibrary_work_key`/`hydrated_at`/`editions_synced_at` | S2-14 (pendiente de abrir) | P2 |
| `hydrate_*` permiten a un `user` rellenar fichas vacías (¿deseado?) + contradicción con #699 | #699 | P1/P2 |
| SW cachea HTML privado sin purga en logout | #680 | P1 |
| Tokens Supabase sin cifrar en Android + allowBackup | #679 | P1 |
| Saga raíz creable por cualquier user / HIBP desactivado | S2-13/S2-20 (pendientes) | P3 |

## Qué se verificó y está sano (no re-auditar sin motivo)

Escalada de `role` por UPDATE bloqueada; `follows` no filtra solicitudes a
terceros; RPCs de club/eventos con gate correcto y validación de entrada;
moderación (`content_reports`) bien acotada; sin mass-assignment; auth de
export; uploads validados en código. Lista completa: sección «Cobertura y
límites» de la fase 2 del informe.
