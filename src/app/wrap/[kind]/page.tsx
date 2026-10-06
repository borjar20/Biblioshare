import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { loginHref } from "@/lib/auth/safe-next";
import { getCurrentUser } from "@/lib/supabase/server";
import { getOwnWrapUp } from "@/lib/wrap-ups/get-own-wrap-ups";
import { posterFor, type T } from "@/lib/wrap-ups/view-models";
import { isWrapUpKind } from "@/lib/wrap-ups/windows";
import { WrapUpPlayerRoute } from "@/components/wrap-ups/wrap-up-player-route";

// Todo depende de la sesión (RLS limita la fila al dueño): nada de `use cache`
// (regla #437). Sin loading.tsx: la ruta hace notFound() y un loading.tsx le
// robaría el 404 (regla de docs/redesign/plan-00-navegacion.md). El acceso a
// `params` va por DEBAJO del <Suspense>, como en las fichas (#442).
type Props = { params: Promise<{ kind: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { kind } = await params;
  if (!isWrapUpKind(kind)) return { title: "Biblioshare" };
  const t = await getTranslations("wrapUps.stories.cover");
  return { title: `${t("title", { kind })} · Biblioshare` };
}

export default async function WrapPage({ params }: Props) {
  const t = await getTranslations("wrapUps.ui");
  return (
    <Suspense fallback={<PlayerSkeleton label={t("loading")} />}>
      <WrapContent params={params} />
    </Suspense>
  );
}

async function WrapContent({ params }: Props) {
  const { kind } = await params;
  if (!isWrapUpKind(kind)) notFound();
  const user = await getCurrentUser();
  if (!user) redirect(loginHref(`/wrap/${kind}`));
  const wrapUp = await getOwnWrapUp(kind);
  if (!wrapUp) notFound();
  const t = await getTranslations();
  const models = wrapUp.payload.stories.map((s) => posterFor(s, wrapUp.payload, t as unknown as T));
  return <WrapUpPlayerRoute wrapUp={wrapUp} models={models} />;
}

/** Hueco del reproductor mientras llega la fila: misma columna, sin saltos. */
function PlayerSkeleton({ label }: { label: string }) {
  return (
    <div className="fixed inset-0 z-50 bg-[#1c1714]" aria-busy="true" aria-label={label}>
      <div className="mx-auto flex h-full max-w-[480px] flex-col gap-4 p-4">
        <div className="h-1 w-full animate-pulse bg-white/20" />
        <div className="flex-1 animate-pulse bg-white/10" />
      </div>
    </div>
  );
}
