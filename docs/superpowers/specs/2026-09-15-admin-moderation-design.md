# Moderación administrativa — #1183

> Diseño aprobado en conversación el 2026-09-15. Diseño congelado; implementación verificada en desarrollo. No describe producción.

## Contrato aprobado

Administradores globales pueden retirar, restaurar y borrar definitivamente clubes,
posts sociales, publicaciones de clubes y comentarios. Una retirada oculta el objeto
a todos en las superficies normales, incluidos autor, propietario, miembros y admin;
solo el panel de moderación permite consultarlo. Bloquea participación y enlaces
directos. Restaurar conserva la privacidad previa y las retiradas individuales de
descendientes. Borrar un post nunca borra el pase o sesión personal que lo originó.

Cada operación exige motivo y guarda actor, fecha y evidencia. El borrado definitivo
exige confirmación explícita (nombre exacto para clubes) y elimina dependencias;
reportes e historial sobreviven. Solo administradores acceden al historial y a la
evidencia conservada de contenido retirado/eliminado. No se amplía el rol global de
los moderadores de un club.

## Panel

Navegación alcanzable desde `/admin`: Reportes, Contenido, Clubes, Usuarios e Historial.
Reportes separa pendientes y resueltos, muestra contexto y permite descartar/resolver
con motivo; la retirada es una operación explícita. Contenido permite búsqueda y
filtro de tipo/estado sin reporte previo. Clubes comparte el flujo con confirmación
del alcance de cascada. Acciones destructivas quedan tras el menú y un formulario
de confirmación. Estados vacíos, error y carga tienen mensajes explícitos.

## Arquitectura y comprobación

Postgres autoriza cada operación, conserva evidencia y ejecuta cambios+auditoría en
una transacción. Restricciones de visibilidad cubren RLS y funciones privilegiadas;
las consultas administrativas usan RPCs con comprobación explícita del rol, no
caché compartida. Server Actions validan entrada y revalidan las superficies afectadas.

Pruebas SQL con datos desechables: matriz de roles, acceso directo, escrituras tras
retirada, restauración de padre con hijo retirado, borrado con cascadas, preservación
de pases y evidencia, y denegación de RPCs administrativas a no admins. Pruebas de
acciones y navegador cubren confirmación, errores, filtros y flujo completo.

Dev primero. No se considera aplicado en producción por existir la migración local.
