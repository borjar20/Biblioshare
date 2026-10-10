# Triage: estados internos

Estos estados sirven para razonar y resumir el trabajo. No son etiquetas de GitHub y no se
sincronizan con ellas; las etiquetas publicables son las tres dimensiones de `AGENTS.md`
(área, tipo, prioridad) y se aplican según `issue-tracker.md`.

| Estado interno | Significado |
| --- | --- |
| needs-triage | Pendiente de evaluar |
| needs-info | Falta información para decidir |
| ready-for-agent | Especificado y listo para que lo haga un agente |
| ready-for-human | Requiere intervención humana |
| wontfix | Se decidió no abordarlo |

- Usar `wontfix` internamente no implica aplicar esa etiqueta ni cerrar la issue. Las issues
  `tipo:acta` siguen su propio tratamiento (`AGENTS.md`): no se hacen ni se cierran.
- Al retomar trabajo, reconstruye el estado desde la evidencia (comentarios, PR enlazadas,
  commits). Que una issue no tenga estado no significa que nunca se evaluara.
