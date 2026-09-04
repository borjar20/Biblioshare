# Enlace estable al perfil para soportes físicos (tarjeta NFC)

> **[Histórico · congelado 2026-09-04]** Spec de diseño de `/go/<uuid>` y del redirector externo
> que permite grabar un enlace a un perfil en un soporte que no se puede reescribir a gusto
> (tarjeta NFC de regalo, QR impreso). Explica el *porqué* y las alternativas descartadas; el
> estado de hoy manda en `src/app/go/[id]/route.ts` y en el repo `borjar20/go`.

## 1. Problema

Se quiere regalar una tarjeta NFC que abra el perfil de Biblioshare de una persona. La URL de un
perfil hoy es `https://biblioshare-nine.vercel.app/u/<username>`, y las tres piezas pueden cambiar:

- **El dominio.** `biblioshare-nine.vercel.app` es el subdominio automático de Vercel (el nombre
  `biblioshare` estaba cogido). Cambiará en cuanto haya dominio propio, y muere si el proyecto se
  renombra o se migra de hosting.
- **El esquema de rutas.** `/u/<username>` es una decisión de hoy, no un contrato.
- **El username.** Hoy se fija en el onboarding y no hay UI para cambiarlo, pero nada impide que
  la haya mañana.

Una tarjeta grabada con esa URL literal queda muda con cualquiera de los tres cambios. Y aunque los
tags NTAG son reescribibles si no se bloquean, reescribir exige tener la tarjeta en la mano: no vale
como mecanismo principal para un regalo.

**Restricción del momento:** no se quiere comprar dominio todavía. Sin dominio propio, el único
punto fijo posible es una cuenta que el autor no va a cerrar.

## 2. Opciones consideradas

| Opción | Qué resuelve | Por qué no (o sí) |
|---|---|---|
| Proxy propio (Worker / proyecto Vercel aparte) | Destino editable, 302 real | Infra extra para un salto; en `*.workers.dev` / `*.vercel.app` vuelve a depender de un dominio ajeno. |
| Acortador (Dub.co, Bitly, short.io) | Cero código | Tercero que puede cerrar o paywallear el edit. Para algo que debe durar años, no. |
| Cloudflare Pages + `_redirects` | 302 real, gratis | Otra cuenta que mantener; no aporta nada sobre GitHub para este uso. |
| Usar `biblioshare-nine.vercel.app` tal cual | Cero trabajo | Vercel conserva ese subdominio al añadir dominio custom, pero muere si se renombra el proyecto o se migra. Riesgo real a medio plazo. |
| **GitHub Pages como redirector** | Destino editable desde el móvil, cuenta que sobrevive a cualquier cambio de hosting | Salto en cliente (`meta refresh` + `location.replace`), no 302 HTTP. Imperceptible en móvil. **Elegida.** |
| **Ruta `/go/<uuid>` en la app** | Destino independiente del username | No cubre cambio de dominio; por eso va combinada con la anterior. **Elegida.** |

## 3. Diseño: tres capas, cada una cubre lo que la anterior no

```
tarjeta NFC ──► https://borjar20.github.io/go/<slug>/     (capa 1: GitHub Pages)
                     │  meta refresh + location.replace
                     ▼
                https://<dominio actual>/go/<uuid>          (capa 2: route handler)
                     │  307
                     ▼
                https://<dominio actual>/u/<username>       (perfil, público o stub privado)
```

**Capa 1 — repo `borjar20/go`, GitHub Pages.** Un directorio por tarjeta (`<slug>/index.html`)
con `meta http-equiv="refresh"` y `location.replace` al destino. Cambiar el destino = editar un
fichero en la web de GitHub. Sin build, sin Jekyll (`.nojekyll`), sin dependencias. La raíz
redirige a la home de Biblioshare y `404.html` explica que el enlace no existe. Esta capa absorbe
el cambio de **dominio** y de **esquema de rutas**.

**Capa 2 — `src/app/go/[id]/route.ts`.** Route handler `GET` que valida que `id` es un uuid,
busca `username` en la vista `profile_identities` por `user_id` y responde **307** a
`/u/<username>`. 404 (`notFound()`) si el id no es uuid o no hay perfil. Esta capa absorbe el
cambio de **username**, sin que nadie edite nada.

Decisiones dentro de la capa 2:

- **Route handler, no página.** Un tap en la tarjeta debe recibir una redirección HTTP, no un
  shell HTML que redirige después. Además queda fuera de `cacheComponents` y del patrón
  página-síncrona-más-`<Suspense>` de `/u/[username]`.
- **307 y no 308.** El destino puede cambiar (username); un 308 lo dejaría cacheado en el
  navegador.
- **Cliente sin sesión** (`createPublicClient()`), por la regla #437: el par id → username es
  idéntico para un anónimo, el dueño y un tercero. `profile_identities` expone la identidad de
  cualquier perfil, privado incluido, con `SELECT` para `anon`; un perfil privado redirige igual y
  es el stub de `/u/<username>` quien decide qué enseñar.
- **Sin `use cache`.** Una consulta por tap no justifica cachear, y así no hay nada que invalidar
  si el username cambia.

**Capa 3 — el tag no se bloquea.** Los NTAG213/215 son reescribibles mientras no se haga *lock*.
Último recurso si GitHub desapareciera: la persona reescribe la URL con NFC Tools.

## 4. Cómo añadir una tarjeta

1. Obtener el uuid del perfil: `select user_id from profiles where username = '<username>'` en
   prod (o `profile_identities`, que es lo que lee la ruta).
2. Comprobar el salto: `https://biblioshare-nine.vercel.app/go/<uuid>` debe abrir el perfil.
3. En el repo `go`, crear `<slug>/index.html` a partir de la plantilla del README con ese
   destino, y hacer commit.
4. Comprobar `https://borjar20.github.io/go/<slug>/` en el móvil.
5. Grabar esa URL en el tag con NFC Tools como registro URI. **No bloquear el tag.** Cabe de
   sobra en un NTAG213 (144 bytes; la URL ronda los 40).

## 5. Cuando haya dominio propio

Se cambia el destino en los `index.html` del repo `go` (un commit) y, opcionalmente, se añade
una *redirect rule* en el DNS del dominio para que `<dominio>/go/*` siga vivo aunque la app
cambie de hosting. Las tarjetas ya repartidas no se tocan.

## 6. Pruebas

- `src/app/go/[id]/route.test.ts` (Vitest): 404 sin consulta para un id que no es uuid, 404 sin
  perfil, 307 con `Location` `/u/<username>`, uuid en mayúsculas, cliente sin sesión (el de la
  petición no se llama), error de consulta propagado.
- `e2e/go-perfil.spec.ts` (Playwright, **sin login**): 307 con `Location` correcto, un visitante
  anónimo acaba en el perfil y no en `/login`, 404 para id inválido y uuid huérfano.
