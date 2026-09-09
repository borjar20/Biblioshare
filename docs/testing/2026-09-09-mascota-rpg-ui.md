# Mascota RPG UI — verificación local

> Evidencia de implementación · 2026-09-09 · issue #1165 · publicación pendiente.

Entorno: Node 22.23.1, build de producción de Next.js 16.3.0 y `next start`
en el puerto 3000. Pruebas por lotes con un worker contra Supabase de desarrollo.
No se cambia el esquema ni el motor de combate.

## Comprobaciones completadas

- Vitest: 69 ficheros, 491 tests aprobados de `src/components/pet`, `src/lib/pet`
  y navegación de pantalla completa. Incluyen retorno seguro, vistas, separación
  por usuario, pausa/recuperación, almacenamiento fallido y resultado confirmado
  mientras el panel o la pestaña estaban ocultos.
- Build de producción y TypeScript aprobados. Lint de los módulos afectados sin
  errores; un aviso heredado de variable `_equipment` sin uso en un test histórico.
- Equipo: dos e2e aprobados. Copias y comparación, equipar/desequipar, captura
  inmutable en combate, concurrencia y aislamiento entre cuentas.
- Entrenamiento: dos e2e aprobados sin reintentos. Salida a Biblioshare y vuelta
  al mismo intento, tick y snapshot; una sola fila. Autoridad, resolución
  concurrente, replay, ulti por teclado, cancelación y foco. Botón de habilidad
  con desplazamiento y cambio de altura de 0 px durante el combate a 320 px.
- Aventura: un e2e aprobado sin reintentos. Concesión por actividad, recuperación
  tras recargar con la misma intención, resolución, reintento o recompensa y
  aislamiento RLS. El contador pendiente se verifica contra la RPC autenticada.
- Eclosión y compañera: tres e2e aprobados. Crear nombre/clase, entrar en
  Personaje, compañera en el marco general, ocultar/mostrar y ausencia sin sesión.
- Diario: dos e2e aprobados. Tres misiones, once familias de logros y una sesión
  real que completa una misión y obtiene su celebración.
- Madriguera: dos e2e aprobados. Selección social antes y después de eclosionar,
  vistas móvil/escritorio y ampliación de 12 a 60 mascotas con total real de 65.

Resultado de los recorridos seleccionados: **12 e2e aprobados**, sin reintentos
automáticos. Los selectores del diseño anterior se actualizaron antes de sus
ejecuciones finales; no se rebajaron las comprobaciones de autoridad o geometría.
- Navegador: 18 combinaciones de pantalla/ancho (320, 390 y 1440 px), un solo
  landmark `main`, sin desbordamiento horizontal ni recursos de mascota fallidos.
  Campamento, Personaje, Mochila, Diario, Madriguera y entrenamiento inicial.
- Mismo fondo `rgb(7, 31, 25)` y texto `rgb(244, 240, 216)` en claro y oscuro.
  Retorno a `/coleccion?tipo=libros`, historial atrás/adelante y foco en el título.
- Apertura/cierre de nombre y clase, desglose de atributos con teclado, once
  familias de logros y selección de mascota en Madriguera.
- Revisión de código final: sin hallazgos pendientes en navegación, estado
  compartido, recuperación por intención y confirmación visible del resultado.

Capturas y reportes locales en `.superpowers/brainstorm/2026-09-09/qa-*`.
Los fondos elegidos y su procedencia están en `public/pet/scenes/`.
La captura final confirma el retrato completo y centrado, encabezados sans y
una sola misión en el resumen móvil; Diario mantiene la colección completa.

## Alcance de la evidencia

La revisión visual usa la cuenta persistente sin escribir datos. Los e2e de
combate usan cuentas desechables y limpieza por API. Los mensajes locales de
Vercel Speed Insights y de portadas externas no son fallos de los recursos de
mascota. Esta evidencia no afirma publicación ni aceptación jugable nueva del
balance R4b.

El servidor volvió a registrar `HANGING_PROMISE_REJECTION` de Auth durante
prerender, también fuera de `/mascota`. Seguimiento previo #1098 y #1126; no se
atribuye al rediseño ni se declara resuelta su causa.
