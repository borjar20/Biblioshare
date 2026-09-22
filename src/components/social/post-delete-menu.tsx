"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ActionMenu } from "@/components/ui/action-menu";
import { deletePost } from "@/lib/social/post-actions";

// Borrar un post propio desde CUALQUIER tarjeta (pensamiento, hito, reseña,
// avance). Nació en ThoughtCard y se extrajo al darle «Eliminar» al resto
// (spec 2026-09-22-posts-limpieza-al-borrar-pase). Autor o moderador: lo decide
// la RLS de `posts` dentro de `deletePost`; la tarjeta solo muestra el menú si
// `event.viewerCanDelete`.
//
// La tarjeta desaparece SOLO tras `ok:true`: si la RLS lo bloqueó o hubo un
// fallo, se queda y avisa en línea (nunca desaparece a ciegas).
//
// En /post/[id] la tarjeta ES la cabecera de la página: ocultarla dejaría un
// hilo sin post, así que ahí se vuelve a Inicio.
export function useDeletePost(postId: string | null | undefined) {
  const t = useTranslations("feed");
  const router = useRouter();
  const pathname = usePathname();
  const [deleted, setDeleted] = useState(false);
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();

  function requestDelete() {
    if (!postId) return;
    if (!window.confirm(t("postDeleteConfirm"))) return;
    setError(false);
    startTransition(async () => {
      const result = await deletePost(postId);
      if (!result.ok) {
        setError(true);
        return;
      }
      if (pathname === `/post/${postId}`) router.replace("/");
      else setDeleted(true);
    });
  }

  return { deleted, error, pending, requestDelete };
}

// `ActionMenu` ya trae aria-haspopup, cierre por Escape/clic fuera y el estilo
// `danger`. Mismo trigger que tenía ThoughtCard.
export function PostDeleteMenu({ onDelete, pending }: { onDelete: () => void; pending: boolean }) {
  const t = useTranslations("feed");
  return (
    <ActionMenu
      label={t("postMenu")}
      triggerClassName="rounded-full px-1.5 py-0.5 text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
      items={[
        {
          key: "delete",
          label: t("postDelete"),
          onSelect: onDelete,
          disabled: pending,
          danger: true,
        },
      ]}
    />
  );
}

export function PostDeleteError() {
  const t = useTranslations("feed");
  return (
    <p role="alert" className="text-[11px] text-status-dropped">
      {t("postDeleteError")}
    </p>
  );
}
