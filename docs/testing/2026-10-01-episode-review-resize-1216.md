# Persistencia de la reseña al cambiar de tamaño — #1216

> [Verificado localmente · 2026-10-01] · build de producción Next 16.3.8, Supabase local y Chromium real.

El borrador enfocado se guarda al cruzar el breakpoint de 1024 px en ambos
sentidos. Blur y cambio de tamaño consumen el mismo foco antes de guardar;
solo hay una escritura aunque ambos eventos lleguen antes del commit de React.

## Evidencia

| Comprobación | Resultado |
| --- | --- |
| Baseline de navegador, build `9QoCXgoFi_GR79AEU4FT3` | FAIL esperado: el texto conservado visualmente seguía `null` en BD y no hubo escritura |
| Carrera antes del commit React | FAIL conservado: 21 PASS, 1 FAIL; se esperaba una llamada y llegaron dos con el textarea aún conectado |
| Unitarios del candidato | 22 PASS en dos archivos |
| Tipos y lint focal | PASS, cero errores/avisos |
| Revisión independiente | Aprobado |
| Build local `PY9Lk-Om0rzSws3aetVUP` | PASS, 73 páginas generadas |
| Navegador contra el build | PASS: PC→móvil, móvil→PC y blur normal, una escritura de reseña en cada caso |

La comprobación de navegador lee el valor realmente persistido por REST.
Después del primer cruce, selecciona otro episodio y vuelve; después recarga.
El último caso vuelve a comprobar el texto tras recargar. No se considera
persistencia la simple conservación visual de un textarea oculto.

Los resultados finales están en
`.scratch/ticket-campaign/qa1216-local/browser-fixed-1790840904615/result.json`,
con capturas de 1280×900 y 390×844. La consola y las respuestas HTTP del
recorrido quedaron sin errores. Se distinguieron las peticiones que contienen
la reseña de otras acciones de lectura al montar: contar todos los POST daba
un falso duplicado. Las seis superficies de datos de la fixture (visionados,
pases, episodios, serie, perfil y cuenta) terminaron sin filas propias.

El baseline está en `browser-baseline-1790840549828/`; los unitarios RED de la
carrera, en `resize-before-commit.log`, y los GREEN, en
`green-focus-coordination.log`, todos dentro del mismo directorio de QA.

## Límites

La verificación usa datos propios de una instancia local, no la cuenta
persistente de dev ni datos productivos. Un primer harness anterior no llegó a
arrancar por faltar el namespace de fixture. La primera pasada del candidato
se detuvo por un selector que también encontraba el botón de marcar el
siguiente episodio; su primer guardado sí había pasado. El selector corregido
completó los tres recorridos.

El servidor registró `The destination stream closed early` durante pasadas que
incluían recargas y cierre del navegador. No hubo fallo funcional observado;
su atribución a cancelación normal, framework o harness queda separada en
[#1263](https://github.com/borjar20/Biblioshare/issues/1263). Este PASS acredita
la persistencia y coordinación de reseñas, no salud global del streaming.
