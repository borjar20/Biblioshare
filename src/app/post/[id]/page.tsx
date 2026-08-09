import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { getPostEvent, type FeedEntry } from "@/lib/social/feed";
import { FeedItem } from "@/components/social/feed-item";
import { SHELL_APP } from "@/lib/ui/layout";

// Ruta propia del post (`/post/[id]`): donde aterrizan notificaciones y deep
// links. Es una lectura filtrada por RLS por usuario (la audiencia de un post =
// su perfil), así que NO es cacheable en servidor (regla #437): nada de
// `use cache`, ruta dinámica.
//
// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export const metadata: Metadata = {
  title: "Publicación — Biblioshare",
};

export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  const supabase = await createClient();

  // La RLS de `posts` gatea la audiencia: "no visible" y "no existe" vuelven
  // igual (null). Un post PÚBLICO lo ve también un anónimo, así que no se
  // redirige a login — solo 404 si no es visible.
  const result = await getPostEvent(supabase, user?.id ?? null, id);
  if (!result) notFound();

  const { event, knownUsernames } = result;
  const entry: FeedEntry = {
    source: "person",
    id: event.id,
    eventDate: event.eventDate,
    orderDate: event.orderDate,
    sortDate: event.sortDate,
    event,
  };

  // La tarjeta ya trae su hilo (ReviewInteractions): en `/post/[id]` es el
  // contenido principal. `hideActor` queda en false — aquí sí interesa quién
  // publicó, a diferencia de la pestaña Actividad del perfil.
  return (
    <div className={`mx-auto w-full ${SHELL_APP} flex-1 px-5 pt-[18px] pb-[22px] lg:px-7 lg:pt-[26px]`}>
      <div className="mx-auto w-full max-w-2xl">
        <FeedItem entry={entry} viewerLoggedIn={!!user} knownUsernames={knownUsernames} />
      </div>
    </div>
  );
}
