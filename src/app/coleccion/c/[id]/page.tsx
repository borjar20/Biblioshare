import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getCollection } from "@/lib/library/collections";
import { CollectionDetail } from "@/components/library/collection-detail";
import { CollectionMenu } from "@/components/library/collection-menu";
import { ChevronLeftIcon } from "@/components/ui/icons";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
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
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const detail = await getCollection(supabase, user.id, id);
  if (!detail) notFound();

  const t = await getTranslations("collection");

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6">
      {/* Topbar del frame B: «‹» a /coleccion + nombre + menú «⋯»
          (renombrar/descripción/borrar, Sesión 2). */}
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
        <CollectionMenu
          collectionId={detail.id}
          name={detail.name}
          description={detail.description}
          isSorteable={detail.isSorteable}
        />
      </div>

      <CollectionDetail detail={detail} />
    </div>
  );
}
