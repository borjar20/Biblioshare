import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { loginHref } from "@/lib/auth/safe-next";
import { getCollection } from "@/lib/library/collections";
import { SHOW_DROPPED_PARAM } from "@/lib/library/hide-dropped";
import { CollectionDetail } from "@/components/library/collection-detail";
import { CollectionMenu } from "@/components/library/collection-menu";
import { AddItemsToCollectionSheet } from "@/components/library/add-items-to-collection-sheet";
import { ChevronLeftIcon } from "@/components/ui/icons";
import { SHELL_GRID } from "@/lib/ui/layout";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) return { title: "Colección — Biblioshare" };

  // Solo el nombre: no hidratamos la colección entera (portadas/pases/notas)
  // solo para el <title> — eso lo hace el componente. La RLS ya restringe al
  // dueño, así que una fila ajena/inexistente no devuelve nombre.
  const { data: col } = await supabase
    .from("collections")
    .select("name")
    .eq("id", id)
    .maybeSingle();
  return {
    title: col ? `${col.name} — Biblioshare` : "Colección — Biblioshare",
  };
}

// Detalle de colección (Colección v2, frame B): ruta propia enlazada desde
// `CollectionCard` (Task 5). Doble red de seguridad ante id ajena/inexistente
// — `getCollection` ya filtra por dueño (RLS + comprobación explícita) — y
// aquí se traduce en `notFound()`, no un error sin más.
export default async function CollectionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ abandonados?: string }>;
}) {
  const { id } = await params;
  const { abandonados } = await searchParams;
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) redirect(loginHref(`/coleccion/c/${id}`));

  // Misma regla que en /coleccion: la preferencia manda salvo que la URL la
  // anule para esta vista (spec D7).
  const { data: prefs } = await supabase
    .from("profiles")
    .select("hide_dropped")
    .eq("user_id", user.id)
    .maybeSingle();
  const hideDropped = (prefs?.hide_dropped ?? false) && abandonados !== "1";

  const detail = await getCollection(supabase, user.id, id, hideDropped);
  if (!detail) notFound();

  const t = await getTranslations("collection");

  return (
    <div className={`mx-auto flex w-full ${SHELL_GRID} flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8`}>
      {/* Topbar del frame B: «‹» a /coleccion + nombre + «＋ Añadir ítems»
          (busca en toda la biblioteca, alta sin salir de la página) + menú «⋯»
          (renombrar/descripción/sorteo/borrar, Sesión 2). */}
      <div className="flex items-center gap-2.5">
        <Link
          href="/coleccion"
          aria-label={t("back")}
          className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[9px] border border-border bg-surface text-foreground transition-colors hover:bg-surface-muted"
        >
          <ChevronLeftIcon className="h-4 w-4" />
        </Link>
        <span className="min-w-0 flex-1 truncate font-serif text-sm font-semibold text-foreground">
          {detail.name}
        </span>
        <AddItemsToCollectionSheet collectionId={detail.id} />
        <CollectionMenu
          collectionId={detail.id}
          name={detail.name}
          description={detail.description}
          isSorteable={detail.isSorteable}
        />
      </div>

      <CollectionDetail
        detail={detail}
        showDroppedHref={`/coleccion/c/${id}?${SHOW_DROPPED_PARAM}=1`}
      />
    </div>
  );
}
