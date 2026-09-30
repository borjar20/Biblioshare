# Filtros y vigencia de errores sociales — 2026-09-30

> **[Evidencia de ejecución · verificada contra código, Chromium y objetos de dev/prod el 2026-09-30]**

## #780 — anulación de abandonados

El chip «Mostrar abandonados» solo aparece cuando la preferencia está activa
y no hay un filtro de estado explícito. Ese filtro ya prevalece sobre la
preferencia al consultar la colección; el control debe seguir la misma regla.

Chromium con `codex_qa`: antes del guard, la prueba exigía cero enlaces con
`status=completed` y encontraba uno (**FAIL**). Después, las aserciones
funcionales pasan: sin estado se ofrece el chip y pulsarlo añade
`abandonados=1`; con los cuatro estados válidos no aparece; al volver a
«Todos los estados» reaparece. No se necesitaron obras nuevas. La preferencia
temporal quedó restaurada al valor inicial `false`, comprobado por una lectura
independiente. ESLint del componente y los diez tests de ocultación: **PASS**.

El spec completo conserva **FAIL** por los errores de consola `Date.now()` de
#895. Un intento intermedio también falló porque la prueba cerraba un panel
que Next había conservado abierto después de navegar; el helper corregido
asegura que el panel esté abierto antes de comprobarlo. No era otro fallo de
persistencia de la preferencia. Trazas y resultados en
`.scratch/ticket-campaign/test-results/qa780-*`.

## #552 — modelo `thoughts` retirado

El problema describía la policy de SELECT de una tabla histórica. La migración
`20260847_posts_drop_thoughts.sql` eliminó esa tabla tras absorberla en `posts`.
Reverificación actual de objetos reales, sin escribir contenido: en **dev y
prod**, `to_regclass('public.thoughts')` es null; `posts` existe y conserva las
policies `posts select visible` y `posts select moderate`.

No hay lecturas `.from("thoughts")` en `src`. El gate actual ejecuta
`posts_rls.sql`, no la regresión histórica `thoughts_rls.sql`. El test actual
usa el resolutor SECURITY DEFINER para verificar la desaparición real del
post privado tras el borrado del administrador, evitando el falso verde
descrito en la issue. La ejecución local terminó en **ALL ASSERTIONS PASSED**
y **ROLLBACK**. El diagnóstico histórico no se presenta como fallo vivo ni
se añaden permisos a una tabla retirada.

## #672 — serie sin episodios

El recorrido antiguo de «Compartir» quedó sustituido por el registro de
episodios y un post diario `watched`. `insertEpisodeWatches` devuelve `false`
para un lote vacío; `addSession` solo pide el post diario si se añadió algo y
sale del recorrido de series antes de crear una sesión o un post `progressed`.

La regresión añadida envía un formulario antiguo con `share=on` y ningún
episodio. No crea sesión, post ni celebración. El caso positivo de episodios
en varias temporadas sigue cubierto. Los **12 tests de la acción pasan**.
Retirar temporalmente el guard de avance hace fallar el caso nuevo; restaurarlo
devuelve el verde. Fuente restaurada, sin cambiar el comportamiento publicado
ni ejecutar escrituras remotas. La prueba es de acción con dobles de acceso a
datos, no un recorrido de navegador con episodios reales.
