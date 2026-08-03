import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getRoundState } from "@/lib/clubs/rounds/rounds";
import { getInteractionSummary } from "@/lib/social/interactions";
import { resolveKnownMentions } from "@/lib/social/resolve-mentions";
import { ReviewInteractions } from "@/components/social/review-interactions";
import { RoundComposer } from "./round-composer";
import { RoundAnswerGate } from "./round-answer-gate";
import { RoundHistory } from "./round-history";

// Los cinco estados de la maqueta viven aquí porque son excluyentes: cuál se
// pinta lo decide el estado que devuelve SQL, no el cliente.
export async function RoundBlock({
  clubId,
  clubSlug,
  viewerId,
}: {
  clubId: string;
  clubSlug: string;
  viewerId: string;
}) {
  const [state, t] = await Promise.all([getRoundState(clubId), getTranslations("club.round")]);
  if (!state) return null;

  const supabase = await createClient();
  const summary = state.round
    ? (await getInteractionSummary(supabase, "club_round", [state.round.id])).get(state.round.id)
    : undefined;

  const esMiTurno = state.holderId === viewerId;
  const casaDisponible = state.dayIndex >= 3;

  return (
    <section className="flex flex-col gap-4 rounded-card border border-border bg-surface p-4 shadow-card">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-serif text-[15px] font-semibold">{t("title")}</h2>
        <span className="font-mono text-[11px] tracking-wider text-muted-foreground">
          {state.periodKey}
        </span>
      </div>

      {/* 03 y 04: ya hay ronda escrita este periodo. */}
      {state.round ? (
        <>
          {state.round.authorId === null && (
            <span className="self-start rounded-full border border-gold/35 bg-gold/15 px-2.5 py-0.5 font-mono text-[10.5px] tracking-wider text-gold-ink uppercase">
              {t("houseStamp")}
            </span>
          )}
          <p className="font-serif text-xl leading-snug font-medium text-balance">
            {state.round.prompt}
          </p>
          {summary && (
            <ReviewInteractions
              interactionTargetId={summary.interactionTargetId}
              reactionCount={summary.reactionCount}
              viewerReacted={summary.viewerReacted}
              commentCount={summary.commentCount}
              comments={summary.comments}
              viewerLoggedIn
              showTargetReaction
              clubId={clubId}
              // Firma real: (supabase, texts: string[]). Se le pasan la
              // consigna Y los cuerpos de las respuestas, igual que
              // checkpoints.ts con su chat.
              knownUsernames={await resolveKnownMentions(supabase, [
                state.round.prompt,
                ...summary.comments.map((c) => c.body),
              ])}
            />
          )}
        </>
      ) : esMiTurno ? (
        /* 01: te toca a ti. */
        <RoundComposer clubId={clubId} />
      ) : casaDisponible ? (
        /* 04 sin materializar: la consigna existe, su fila todavía no. */
        <>
          <span className="self-start rounded-full border border-gold/35 bg-gold/15 px-2.5 py-0.5 font-mono text-[10.5px] tracking-wider text-gold-ink uppercase">
            {t("houseStamp")}
          </span>
          <RoundAnswerGate clubId={clubId} />
        </>
      ) : (
        /* 02: le toca a otro y aún tiene sus 48 h. Deliberadamente sin nada que
           responder: si aquí ya hubiera contenido, el turno no valdría nada. */
        <div className="flex flex-col gap-1">
          <p className="font-serif text-[17px] font-semibold">
            {t("waitingTitle", { name: state.holderName ?? "" })}
          </p>
          <p className="text-sm text-muted-foreground">{t("waitingSub")}</p>
        </div>
      )}

      <RoundHistory clubId={clubId} currentPeriodKey={state.periodKey} />
    </section>
  );
}
