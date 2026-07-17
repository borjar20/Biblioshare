import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getChallenges } from "@/lib/challenges/get-challenges";
import { getChallengeProgress } from "@/lib/challenges/get-challenge-progress";
import { ChallengeCard } from "@/components/challenges/challenge-card";
import { NewChallenge } from "@/components/challenges/new-challenge";
import { getNotes, countNotes } from "@/lib/notes/get-notes";
import { MemorizeCard } from "@/components/notes/memorize-card";
import { NotesCountsCard } from "@/components/notes/notes-counts-card";

function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-card border border-border bg-surface shadow-card p-4 ${className}`}
    >
      {children}
    </div>
  );
}

// Rincón ◍ — la mitad cualitativa del antiguo Panel (frames C y H): retos y
// metas, Memorizar y (en F4) el sorteo. Escritorio a dos columnas: retos +
// Memorizar a la izquierda, contadores en el rail.
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

  const [challenges, notes] = await Promise.all([
    getChallenges(supabase, userId, { includeArchived }),
    getNotes(supabase, userId),
  ]);
  const challengeProgress = await getChallengeProgress(
    supabase,
    userId,
    challenges,
  );
  const counts = countNotes(notes);

  const main = (
    <div className="flex flex-col gap-4">
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

      <Card>
        <MemorizeCard notes={notes} />
      </Card>
    </div>
  );

  // Contadores: solo en el rail de escritorio (frame H; el móvil C no los trae).
  const rail = (
    <div className="hidden flex-col gap-4 lg:flex">
      <Card>
        <NotesCountsCard counts={counts} />
      </Card>
    </div>
  );

  return (
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[1fr_300px] lg:items-start">
      <div className="lg:order-2">{rail}</div>
      <div className="lg:order-1">{main}</div>
    </div>
  );
}
