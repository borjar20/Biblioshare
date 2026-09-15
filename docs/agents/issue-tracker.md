# Issue tracker: GitHub

Las issues y especificaciones operativas viven en GitHub Issues
de borjar20/Biblioshare. Usar gh con --repo borjar20/Biblioshare.

Antes de crear una issue:
1. Leer las reglas de issues de AGENTS.md.
2. Consultar las etiquetas existentes:
   gh label list --repo borjar20/Biblioshare --limit 1000
3. Elegir exactamente una etiqueta de área, una de tipo y una
   de prioridad, según AGENTS.md.
4. Usar exclusivamente etiquetas devueltas por la consulta.
   Si falta una necesaria, comunicarlo; no crear etiquetas.
5. Preparar el cuerpo en un archivo y usar --body-file.

Para leer un ticket:
gh issue view <numero> --repo borjar20/Biblioshare --comments

Para publicar una especificación, crear una issue cuando esa
acción esté autorizada. Esta configuración no autoriza por sí
misma publicaciones, comentarios, cierres ni otros cambios remotos.

Los estados internos se definen en triage-labels.md.

**PRs as a request surface: no.**
