<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:biblioshare-docs -->
# Documentación y datos — léelo antes de tocar

- **Fuente de verdad = el repo.** El índice y "qué doc manda para qué" está en `README.md`
  (sección «Gobernanza documental»). Antes de fiarte de un doc, mira su cabecera de frescura:
  `[Canónico · verificado …]` manda; `[Histórico · congelado …]` explica el *porqué*, no el *hoy*.
- **Esquema**: manda `docs/requirements/data-model.md` (verificado contra prod). Dos trampas que
  ya han causado bugs reales: el estado vivo del usuario vive en **`passes`**, nunca en
  `library_entries` (CONGELADA) ni en `diary_entries` (renombrada a `passes`).
- **Migraciones**: "no aparece en `list_migrations`" **≠** "no está en prod" — verifica contra los
  objetos reales (`pg_proc`/`pg_class`), no contra el ledger. Regla: dev primero, luego prod.
- **`docs/superpowers/specs/` y `plans/` son historia** (congelados por feature), no el estado de hoy.
- Al cambiar el esquema o cerrar una feature: actualiza el doc canónico y su fecha. Si dudas de si la
  doc coincide con la realidad, corre el chequeo de `docs/DRIFT-CHECK.md`.
<!-- END:biblioshare-docs -->
