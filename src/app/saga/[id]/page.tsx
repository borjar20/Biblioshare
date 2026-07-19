import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getSagaDetail } from "@/lib/sagas/get-saga-detail";
import { SagaHero } from "@/components/saga/saga-hero";
import { SagaInfo } from "@/components/saga/saga-info";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data: saga } = await supabase
    .from("sagas")
    .select("name")
    .eq("id", id)
    .maybeSingle();

  return { title: saga ? `${saga.name} — Biblioshare` : "Biblioshare" };
}

export default async function SagaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations("saga");
  const supabase = await createClient();

  const detail = await getSagaDetail(supabase, id);
  if (!detail) notFound();

  // Segunda llamada simple a auth.getUser(): getSagaDetail ya la hace por
  // dentro, pero no expone el usuario en SagaDetail. La llamada extra va
  // cacheada por request (createServerClient de @supabase/ssr memoiza vía
  // fetch cache de Next), así que no es una ida y vuelta real de más.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 py-6">
      <SagaHero detail={detail} isAuthenticated={Boolean(user)} />

      {/* Barra de pestañas: fase 1 solo Info; la pestaña Mapa (condicionada a
          detail.hasGraph) llega en fase 2 con el conmutador cliente. */}
      <nav className="border-b border-border px-4">
        <span className="relative inline-block pb-3 text-sm font-semibold text-foreground">
          {t("tabInfo")}
          <span className="absolute inset-x-0 -bottom-px h-0.5 rounded bg-accent" />
        </span>
      </nav>

      <SagaInfo overview={detail.saga.overview} groups={detail.groups} />
    </div>
  );
}
