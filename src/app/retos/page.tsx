import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getChallenges } from "@/lib/challenges/get-challenges";
import { getChallengeProgress } from "@/lib/challenges/get-challenge-progress";
import { ChallengeCard } from "./challenge-card";
import { NewChallenge } from "./new-challenge";

export const metadata: Metadata = {
  title: "Tus retos — Biblioshare",
};

export default async function ChallengesPage({
  searchParams,
}: {
  searchParams: Promise<{ archivados?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const t = await getTranslations("challenges");
  const { archivados } = await searchParams;
  const includeArchived = archivados === "1";

  const challenges = await getChallenges(supabase, user.id, { includeArchived });
  const progress = await getChallengeProgress(supabase, user.id, challenges);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>

      <NewChallenge />

      {progress.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {progress.map((p) => (
            <ChallengeCard key={p.challenge.id} progress={p} />
          ))}
        </div>
      )}

      <Link
        href={includeArchived ? "/retos" : "/retos?archivados=1"}
        className="self-start text-sm text-muted-foreground underline hover:text-foreground"
      >
        {includeArchived ? t("hideArchived") : t("showArchived")}
      </Link>
    </div>
  );
}
