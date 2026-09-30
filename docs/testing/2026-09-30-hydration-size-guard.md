# Tamaños e hidratación pendiente — #1205

> **[Evidencia de ejecución · verificada el 2026-09-30]**

`ensureItemEnriched` podía rellenar tamaños durante el render de una ficha
pendiente. La RPC `hydrate_movie`/`hydrate_series` marca siempre `hydrated_at`,
por lo que un fallo posterior del `after()` completo podía dejarla marcada sin
sus metadatos. El mismo guard que ya protege el backdrop se aplica a tamaños:
solo se escriben si la fila ya está hidratada y quien la abre tiene sesión.

| Caso | Resultado |
|---|---|
| Película pendiente, duración ausente | RED previo: se llamaba a `hydrate_movie`. PASS después: no se llama. |
| Serie pendiente, tamaños ausentes | No se llama a `hydrate_series`. |
| Pendiente con créditos/colección por enriquecer | Ese recorrido sigue activo; no escribe tamaños. |
| Película ya hidratada y con sesión | Se guarda la duración ausente. |
| Serie ya hidratada y con sesión | Se guardan episodios, temporadas y duración de episodio. |
| Visitante anónimo | No intenta escribir tamaños ni registra un falso error de autenticación. |

Vitest: `enrich-item.test.ts`, `enrich-item-book.test.ts`,
`enrich-item-guard.test.ts` y `hydrate-screen.test.ts`, un worker, 36/36 PASS.
La revisión independiente confirmó que los consumidores de película y serie
entregan `hydratedAt` y `viewerLoggedIn`, y que el guard no interrumpe créditos
ni colección. No cambia el esquema ni la firma de las RPC.

La cobertura verifica la decisión de escritura antes del `after()`, con dobles
de TMDB y Supabase. No constituye una reparación de datos antiguos ni una prueba
de todos los fallos posibles de servicios externos.
