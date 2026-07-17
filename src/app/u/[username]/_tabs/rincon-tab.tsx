import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getChallenges } from "@/lib/challenges/get-challenges";
import { getChallengeProgress } from "@/lib/challenges/get-challenge-progress";
import { ChallengeCard } from "@/components/challenges/challenge-card";
import { NewChallenge } from "@/components/challenges/new-challenge";

// Rincón ◍ — la mitad cualitativa del antiguo Panel (frames C y H): retos y
// metas, Memorizar y el sorteo. De momento solo trae los retos; Memorizar (F3)
// y el sorteo (F4) llegan en sus fases.
export async function RinconTab({
  userId,
  includeArchived,
  basePath,
}: {
  userId: string;
  includeArchived: boolean;
  basePath: string;
}) {
  const tChallenges = await getTranslations("challenges");
  const supabase = await createClient();

  const challenges = await getChallenges(supabase, userId, { includeArchived });
  const challengeProgress = await getChallengeProgress(
    supabase,
    userId,
    challenges,
  );

  return (
    <div className="grid gap-6">
      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold tracking-tight">
          {tChallenges("title")}
        </h2>
        <NewChallenge />
        {challengeProgress.length === 0 ? (
          <p className="text-sm text-muted-foreground">{tChallenges("empty")}</p>
        ) : (
          <div className="flex flex-col gap-3">
            {challengeProgress.map((p) => (
              <ChallengeCard key={p.challenge.id} progress={p} />
            ))}
          </div>
        )}
        <Link
          href={
            includeArchived
              ? `${basePath}?tab=rincon`
              : `${basePath}?tab=rincon&archivados=1`
          }
          className="self-start text-sm text-muted-foreground underline hover:text-foreground"
        >
          {includeArchived
            ? tChallenges("hideArchived")
            : tChallenges("showArchived")}
        </Link>
      </div>
    </div>
  );
}
