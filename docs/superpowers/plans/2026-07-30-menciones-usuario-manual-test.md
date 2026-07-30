# Menciones @usuario (E5.K3) — Manual Test Checklist

**Date:** 2026-07-30
**Scope:** Autocompletar `@usuario` en los 3 composers (comentario, reseña, post de club),
notificación `mentioned` al mencionado, render como enlace del `@usuario` conocido, y las
dos puertas de entregabilidad (perfil privado sin seguir → sin ping; post de club a
no-miembro → sin ping).
**Spec:** `docs/superpowers/specs/2026-07-30-menciones-usuario-design.md`
**Plan:** `docs/superpowers/plans/2026-07-30-menciones-usuario.md`
**Status:** PENDING — verificación automática de esta feature no se ejecutó en Task 8
(no se condujo un flujo de navegador de dos cuentas reales); este checklist queda para que
el usuario lo ejecute, siguiendo el patrón de los Bloques E–H de EPIC-05 en los tramos
donde el navegador automático no estaba disponible o no se forzó.

**Verificación ya cubierta sin navegador (no repetir aquí):**
- Unit (Vitest, 923 tests en verde): `extractMentions` (emails, rutas, mayúsculas, cap 10,
  límites 2/3/30/31), `resolveDeliverableMentions` (público/privado/club/self/autor),
  `findActiveMentionToken`, `mergeCandidates`, `MentionText`.
- `mentioned` confirmado en `pg_enum` de `notification_type` en **dev** (sortorder 18); las
  4 políticas RLS de `notifications` (`select own` / `insert as actor` / `update own` /
  `delete own`) no referencian `type` en ningún `qual`/`with_check`, así que `mentioned`
  queda cubierto por la misma RLS que cualquier otro tipo sin cambio — ver
  `.superpowers/sdd/task-8-report.md` para las queries y la salida completa.

---

## Setup

- [ ] **Step 0: Dos cuentas**
  - Cuenta A: `devtest` (credenciales en `.env.local`: `TEST_USER_EMAIL` /
    `TEST_USER_PASSWORD` / `TEST_USER_USERNAME`), perfil **público** (estado por defecto).
  - Cuenta B: crea una cuenta desechable nueva vía signup normal (username único, p. ej.
    `qatest_mention_b`), perfil **público** para los pasos 1-3; la cambiarás a **privado**
    para el paso 4 y la revertirás a pública (o la borrarás) al terminar, per
    `docs/TESTING.md`.
  - Necesitas además un club de pruebas donde A sea miembro y B **no** lo sea (para el paso
    5) — reutiliza uno existente o crea uno rápido con A.
  - `npm run dev` corriendo en el puerto 3000.

---

## Flujo 1 — Comentario en reseña pública: autocompletar → notificación → enlace

- [ ] **Step 1: Teclear `@` y elegir del dropdown**
  - Login como A. Ve a una reseña pública tuya (o de otro usuario) con la pestaña de
    comunidad/comentarios visible.
  - En el input de comentario, teclea `@` seguido de las primeras letras del username de B
    (p. ej. `@qatest`).
  - Confirma que aparece un dropdown con B como candidato (avatar + username; si A sigue a
    B o B sigue a A, debería aparecer con la marca "sigues"; si no, debe aparecer igual vía
    relleno global si hay al menos 1 carácter).
  - Navega el dropdown con ↓/↑ y confirma que la selección resaltada cambia.
  - Pulsa Enter (o Tab) sobre B: confirma que el token se reemplaza por `@qatest_mention_b `
    completo (con espacio final) en el input.

- [ ] **Step 2: Guardar y comprobar la notificación de B**
  - Envía el comentario.
  - Cierra sesión de A, entra como B.
  - Abre la campana de notificaciones: confirma que hay una notificación nueva
    "**A te mencionó**" (usa el nombre/username real de A).
  - Haz clic en la notificación: confirma que **navega a la reseña correcta**, con
    `?tab=community` (o el parámetro que abra la pestaña de comunidad/comentarios) en la
    URL, y que el comentario de A es visible sin scroll adicional excesivo.

- [ ] **Step 3: El comentario renderiza el `@usuario` como enlace**
  - Mientras sigues como B (o vuelve a A), localiza el comentario de A en la reseña.
  - Confirma que `@qatest_mention_b` aparece como **enlace** (estilo distinto del texto
    normal, subrayado al hover) y que el resto del comentario (antes/después de la mención)
    sigue siendo texto plano idéntico a lo escrito.
  - Haz clic en el enlace: confirma que navega a `/u/qatest_mention_b`.

---

## Flujo 2 — Perfil privado, mencionado que NO sigue al autor: sin ping

- [ ] **Step 4: Mención a un perfil privado sin relación de seguimiento**
  - Como B, ve a Ajustes → privacidad y marca tu perfil como **privado**. Confirma (en un
    tercer navegador/incógnito, o cerrando sesión) que B **no** sigue a A y A **no** sigue a
    B — si hay una relación previa, deshazla primero (`Dejar de seguir`) para que el caso
    sea limpio.
  - Como B (autor, perfil ahora privado), escribe/guarda una reseña pública con
    `@` + el username de A en el texto.
  - Confirma que el guardado **no falla** y que el `@usuario` de A sigue apareciendo en el
    texto de la reseña (como enlace si A existe, per el render de Flujo 1).
  - Entra como A: abre la campana de notificaciones y confirma que **NO** hay ninguna
    notificación "B te mencionó". (Si A ya tenía alguna notificación de mención previa de un
    paso anterior, confirma que no aparece una **nueva** tras este guardado — compara
    timestamp/conteo antes y después.)
  - Deja el perfil de B de vuelta en el estado que corresponda para el resto del checklist
    (público, si vas a repetir Flujo 1) o bórralo si ya no lo necesitas.

- [ ] **Step 4b (opcional, refuerzo): mismo caso pero con seguidor aceptado → SÍ notifica**
  - Con B privado, haz que A siga a B y que B **acepte** la solicitud (estado `accepted` en
    `follows`).
  - Repite el guardado de una reseña de B mencionando a A.
  - Confirma esta vez que A **sí** recibe la notificación "B te mencionó".

---

## Flujo 3 — Post de club a un no-miembro: sin ping

- [ ] **Step 5: Mención en post de club a alguien fuera del club**
  - Como A (miembro del club de pruebas), crea un post de texto en el feed del club
    mencionando a B (`@qatest_mention_b`), donde B **no** es miembro de ese club.
  - Confirma que el post se publica con normalidad y que `@qatest_mention_b` aparece en el
    cuerpo del post (como texto/enlace según exista o no B).
  - Entra como B: confirma que **NO** hay notificación "A te mencionó" para este post.
  - (Refuerzo opcional) Añade a B como miembro **activo** del club, repite el post
    mencionándolo, y confirma que esta vez **sí** recibe la notificación, con el enlace
    apuntando al post del club correcto.

---

## Limpieza

- [ ] Borra la cuenta desechable B por completo (incluida `auth.users`), o revierte su
  perfil a público si decides conservarla para otra prueba.
- [ ] Borra los posts/reseñas/comentarios de prueba creados en este checklist si no aportan
  valor de datos reales.
- [ ] Deja el club de pruebas y las membresías como estaban antes de este checklist.
- [ ] Confirma que no queda ningún `next dev` extra corriendo ni worktree huérfano, per
  `AGENTS.md` §Higiene del entorno.
