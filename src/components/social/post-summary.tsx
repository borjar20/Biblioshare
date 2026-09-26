import Link from "next/link";
import { useTranslations } from "next-intl";
import { HeartIcon, CommentIcon } from "@/components/ui/icons";

// Pie de interacción en el FEED (posts Spec 2b): a diferencia del feed anterior
// —que montaba el hilo interactivo entero (ReviewInteractions) y lo desplegaba
// inline—, aquí la tarjeta solo muestra un RESUMEN (reacciones · respuestas) y
// TODO enlaza a `/post/[id]`, donde vive la conversación (PostThread). Decisión
// del dueño: el feed se ojea, la página conversa. Sin estado ni acciones: es un
// simple <Link>, así que la tarjeta puede quedar envuelta en enlaces sin anidar
// interactivos.
//
// Pie ligero (rediseño del feed, propuesta 2): sin filete ni «Ver hilo →», y
// sin ceros. Un post sin actividad no dice «0 comentarios»: invita a
// «Comentar». El corazón solo aparece cuando hay reacciones que contar.
export function PostSummary({
  postId,
  reactionCount,
  commentCount,
}: {
  postId: string;
  reactionCount: number;
  commentCount: number;
}) {
  const t = useTranslations("social");
  return (
    <Link
      href={`/post/${postId}`}
      className="flex items-center gap-4 self-start text-[11.5px] text-muted-foreground transition-colors hover:text-foreground"
    >
      {reactionCount > 0 && (
        <span className="flex items-center gap-1.5 text-accent">
          <HeartIcon className="h-4 w-4" />
          {reactionCount}
        </span>
      )}
      <span className="flex items-center gap-1.5">
        <CommentIcon className="h-4 w-4" />
        {commentCount > 0 ? t("commentsCount", { count: commentCount }) : t("postComment")}
      </span>
    </Link>
  );
}
