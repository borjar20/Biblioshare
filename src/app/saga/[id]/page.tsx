import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { CoverCard } from "@/components/ui/cover-card";
import { getSaga } from "@/lib/sagas/get-saga";

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

  const result = await getSaga(supabase, id);
  if (!result) notFound();

  const { saga, members } = result;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-4 sm:flex-row">
        {saga.coverUrl && (
          <div className="relative aspect-[2/3] w-full max-w-[10rem] shrink-0 overflow-hidden rounded-cover border border-border bg-surface-muted shadow-cover">
            <Image
              src={saga.coverUrl}
              alt={saga.name}
              fill
              sizes="160px"
              className="object-cover"
            />
          </div>
        )}
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{saga.name}</h1>
          <p className="text-sm text-muted-foreground">
            {t("count", { count: members.length })}
          </p>
          {saga.overview && (
            <p className="text-sm text-foreground">{saga.overview}</p>
          )}
        </div>
      </div>

      {members.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-foreground">{t("itemsTitle")}</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {members.map((member) => (
              <CoverCard
                key={`${member.itemType}-${member.itemId}`}
                href={member.href}
                coverUrl={member.coverUrl}
                title={member.title}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
