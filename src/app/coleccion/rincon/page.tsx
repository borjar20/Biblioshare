import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/supabase/server";
import { loginHref } from "@/lib/auth/safe-next";
import { PageHeader } from "@/components/ui/page-header";
import { SkeletonCard, SkeletonLine } from "@/components/ui/skeleton";
import { SHELL_APP } from "@/lib/ui/layout";
import { RinconTab } from "@/app/u/[username]/_tabs/rincon-tab";

export const metadata: Metadata = {
  title: "Retos y objetivos — Biblioshare",
};

type CornerPageProps = { searchParams: Promise<{ archivados?: string }> };

export default function LibraryCornerPage(props: CornerPageProps) {
  return (
    <Suspense fallback={<CornerSkeleton />}>
      <LibraryCornerContent {...props} />
    </Suspense>
  );
}

async function LibraryCornerContent({ searchParams }: CornerPageProps) {
  // La identidad pertenece exclusivamente a la sesión. Ninguna URL o dato
  // del perfil permite abrir las herramientas de otra persona.
  const user = await getCurrentUser();
  if (!user) redirect(loginHref("/coleccion/rincon"));
  const { archivados } = await searchParams;
  const t = await getTranslations("collection");
  const includeArchived = archivados === "1";

  return (
    <div className={`mx-auto flex w-full ${SHELL_APP} flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8`}>
      <PageHeader title={t("rinconTitle")} backHref="/coleccion" backLabel={t("backToLibrary")} />
      <Suspense key={includeArchived ? "archived" : "active"} fallback={<CornerCardsSkeleton />}>
        <RinconTab userId={user.id} includeArchived={includeArchived} basePath="/coleccion/rincon" />
      </Suspense>
    </div>
  );
}

function CornerCardsSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      {[0, 1].map((key) => (
        <SkeletonCard key={key}>
          <SkeletonLine className="mb-4 w-40" />
          <SkeletonLine className="w-full" />
          <SkeletonLine className="mt-2 w-3/4" />
        </SkeletonCard>
      ))}
    </div>
  );
}

function CornerSkeleton() {
  return (
    <div className={`mx-auto flex w-full ${SHELL_APP} flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8`}>
      <SkeletonLine className="h-8 w-52" />
      <CornerCardsSkeleton />
    </div>
  );
}
