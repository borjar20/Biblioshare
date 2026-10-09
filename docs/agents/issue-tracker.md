# Issue tracker: GitHub

Las issues de `borjar20/Biblioshare` son el backlog operativo (reglas en `AGENTS.md`, sección
«Las issues son el backlog»). Con `gh`, pasa siempre `--repo borjar20/Biblioshare`; en una sesión
sin `gh`, usa la herramienta de GitHub disponible con el mismo repo.

## Crear una issue

1. Busca antes si ya existe una que cubra lo mismo.
2. Consulta las etiquetas reales: `gh label list --repo borjar20/Biblioshare --limit 1000`.
3. Elige exactamente una de área, una de tipo y una de prioridad (`AGENTS.md`). Usa solo
   etiquetas que devuelva la consulta; si falta una, dilo en vez de crearla.
4. Escribe el cuerpo en un fichero y pásalo con `--body-file`.

## Leer una issue

`gh issue view <numero> --repo borjar20/Biblioshare --comments`

## Autorización

Leer issues no requiere permiso. Publicar, comentar, cerrar o reetiquetar son cambios remotos:
hazlos cuando la tarea lo pida o el usuario lo autorice. Las PR no son un canal para pedir
trabajo: las peticiones van en issues.

Los estados internos de triage están en `triage-labels.md`.
