# Checklist manual — Rediseño Paper, Fase 2 (la arquitectura de información)

Esta fase **no cambia colores** (eso fue la fase 1). Cambia **dónde está cada
cosa**: la navegación entera se reorganiza, tres rutas desaparecen y el
dashboard se muda de la home al perfil.

## Qué cambió, en una frase

| Antes | Ahora |
|---|---|
| Header con 7 entradas + drawer móvil | Barra inferior (móvil) / nav lateral (`sm+`) con 5 entradas. El header ya no navega. |
| Inicio = pestañas Panel + Siguiendo | Inicio = **solo el feed** |
| Perfil = overview / libros / películas / series | Perfil = **Panel · Colección · Actividad** |
| `/cola` | Colección › pestaña **Colas** |
| `/retos` | Perfil › **Panel** |
| `/usuarios` | Buscar › conmutador **Personas** |
| Admin en el nav | Enlace oculto en tu propio perfil (solo admins) |

## Preparación

1. `npm run dev`
2. Login con `devtest` (credenciales en `.env.local`).
3. **Importante para el punto 6**: antes de empezar, visita `/cola` y `/retos`
   una vez con la app *anterior* si puedes, para que el service worker las
   tenga cacheadas. Si no, ese punto se valida igual con un hard reload.

## 1. Navegación

- [ ] **Móvil** (estrecha la ventana): hay una barra inferior con 5 entradas —
      Inicio · Colección · Buscar · Clubes · Perfil. La entrada de la sección en
      la que estás se ve en color de acento.
- [ ] **Escritorio** (`sm+`): la barra inferior desaparece y aparece una **nav
      lateral** a la izquierda con esas mismas 5 entradas, con la marca arriba.
- [ ] El **header ya no tiene enlaces de navegación**: solo la marca (en móvil),
      la campana de notificaciones y el toggle de tema.
- [ ] **Ya no existe el menú hamburguesa** en móvil.
- [ ] Estando en `/coleccion`, la entrada "Colección" se marca como activa y
      "Inicio" **no** (es el caso que suele salir mal).

## 2. Inicio = el feed

- [ ] `/` muestra directamente el feed de a quién sigues, con su título
      ("Novedades") y los filtros (Todo / Libros / Películas / Series / Reseñas).
- [ ] **No hay pestañas** Panel/Siguiendo.
- [ ] Los filtros funcionan y la URL ya **no** lleva `?tab=following`.
- [ ] Ya no aparece el "Bienvenido a Biblioshare" ni tu @usuario en la home.

## 3. Perfil = Panel · Colección · Actividad

Entra en tu propio perfil (`/u/devtest`):

- [ ] Hay tres pestañas: **Panel** (con un candado), **Colección**, **Actividad**.
- [ ] **Panel** es la pestaña por defecto en tu propio perfil, y contiene todo lo
      que antes estaba en la home: "ahora consumiendo", tira semanal, racha,
      calendario del mes, stats anuales, objetivos… **y los retos personales**.
- [ ] El Panel lleva el aviso "Solo tú ves este panel".
- [ ] **Colección** muestra tu biblioteca con filtros por tipo, estado y orden.
- [ ] **Actividad** muestra el gráfico anual, favoritos y las stat cards.

Ahora **como visitante** (abre una ventana de incógnito, o mira el perfil de otro):

- [ ] La pestaña **Panel no aparece**.
- [ ] La pestaña por defecto es **Colección**.
- [ ] Escribe a mano `/u/devtest?tab=panel` sin ser el dueño: **no debe mostrar
      el panel** (cae en Colección). Este es el punto de seguridad de la fase.

## 4. Colección (`/coleccion`)

- [ ] Tiene pestañas: General · Libros · Películas · Series · **Colas**.
- [ ] Las pestañas de tipo tiñen el subrayado con el color de su tipo.
- [ ] La pestaña **Colas** contiene lo que antes era `/cola`: pestañas por cola,
      gestor (renombrar/eliminar), estimación y la lista.
- [ ] El **drag & drop** de reordenar la cola sigue funcionando.
- [ ] Crear una cola nueva y borrarla funciona.
- [ ] **Bug arreglado**: la pestaña **"Sin cola"** ahora es alcanzable. Antes, si
      tenías al menos una cola creada, hacer clic en "Sin cola" te devolvía a la
      primera cola y era imposible ver los pendientes sin cola. Compruébalo:
      con una cola creada, haz clic en "Sin cola" y **debe quedarse ahí**.

## 5. Buscar con Personas

- [ ] `/buscar` tiene un conmutador **Títulos / Personas** arriba.
- [ ] En **Títulos**: todo sigue igual (tipos, escáner de ISBN en libros,
      resultados, "añadir manual" si eres colaborador+).
- [ ] En **Personas**: buscador de usuarios; buscar por nombre o @usuario
      devuelve perfiles y llevan a `/u/[usuario]`. Es lo que era `/usuarios`.
- [ ] El texto "descubre usuarios" del feed vacío ahora lleva a
      `/buscar?modo=personas`.

## 6. Rutas borradas y service worker

- [ ] `/cola` → **404**
- [ ] `/retos` → **404**
- [ ] `/usuarios` → **404**
- [ ] **El punto que de verdad importa**: haz un **hard reload** (Ctrl+Shift+R) y
      vuelve a visitar `/cola`. Debe seguir dando 404, **no** servirte la página
      vieja desde la caché del service worker. Se subió `CACHE_NAME` a
      `biblioshare-v2` precisamente para esto: al activarse, el SW borra las
      cachés antiguas.
- [ ] Comprueba en DevTools → Application → Cache Storage que solo existe
      `biblioshare-v2`.

## 7. Admin

- [ ] Admin **ya no está en el nav**.
- [ ] Si tu usuario es admin: en **tu propio perfil** aparece un enlace discreto
      "Admin" (con candado), y lleva a `/admin`.
- [ ] Si no eres admin, ese enlace no existe y `/admin` sigue redirigiendo.

## 8. Notificaciones (no debería haber cambiado)

- [ ] La campana sigue en el header y su desplegable funciona.
- [ ] Los deep links de notificaciones a fichas (`?tab=community`) siguen
      llevando a la pestaña Comunidad del ítem.

## Verificación automática ya hecha

- `npm run build` pasa (typecheck + lint).
- `npx playwright test`: **3/3 pasan**, y los tres se actualizaron para la IA
  nueva (home = feed, colas en `/coleccion?tab=colas`, retos en
  `/u/[usuario]?tab=panel`).
- Sondeo de rutas con el server arrancado: `/cola`, `/retos` y `/usuarios`
  devuelven 404; `/coleccion` y `/admin` redirigen a login sin sesión.
- `npm run test` (vitest) **sigue sin arrancar** por la versión de Node
  (v20.9.0 < 20.12). Es previo al rediseño y ajeno a esta fase.
