# Notas de ficha durante streaming — #754

> [Verificado localmente · 2026-10-01] · alcance: build de producción local y navegador contra la app local.

## Problema reproducido

La prueba permanente de navegador pasaba en el build original, pero una salida
temprana del render abandonaba la respuesta antes de que la ficha iniciara su
consulta de notas. `baseline-versioned-1.log` registró entonces el fallo SSR:
`Route /libro/[id] used connection() inside after()`.

## Cambio comprobado

Los tres padres de la ficha inician la consulta después de `notFound()` y antes
de `after()`, con su cliente de servidor y `user.id`. La promesa pasa por
`Tabs` hasta `NotesSection`, sin cliente ni caché nuevos. El manejador temprano
de rechazo solo lo observa: no reemplaza la promesa, por lo que el renderer
recibe el error original.

## Evidencia

| Comprobación | Resultado |
| --- | --- |
| Unitarios de orden, resultado vacío y rechazo | 3/3 PASS |
| Unitarios focalizados, incluida la guarda de `after()` | 4/4 PASS |
| TypeScript y lint | PASS; 0 errores y 28 avisos de lint preexistentes |
| Build de producción local | PASS; 73 páginas y PPR conservado |
| Prueba de navegador permanente | PASS: anónimo recibe `[]`, el dueño ve el cuerpo de su nota y la salida temprana queda cubierta |
| Smoke local | 6/6 PASS en 54,9 s; sin `connection()` ni `cookies()` dentro de `after()` |

La salida temprana reproduce el error del render abandonado en el baseline y
deja de producir ese error tras el cambio. La limpieza independiente dejó `books`, usuarios y
perfiles de la fixture en cero. Los logs, incluido el FAIL del baseline, se
conservan en `.scratch/ticket-campaign/qa754-local/`.

## Límites conocidos

El smoke todavía registra el error de `revalidateTag` seguido por #1250, cinco
avisos `MaxListenersExceededWarning` de Gzip seguidos por #1251 y un mensaje de
destino cerrado durante navegación temprana. Por ello no acredita salud global
del servidor ni atribuye esos avisos a #754. Tampoco demuestra un impacto en el
lector estable ni una fuga de ALS.
