import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getRoundByPeriod, getRoundState } from "@/lib/clubs/rounds/rounds";
import { getInteractionSummary } from "@/lib/social/get-interaction-summary";
import { resolveKnownMentions } from "@/lib/social/resolve-mentions";
import { itemHref } from "@/lib/catalog/item-href";
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
  periodKey,
}: {
  clubId: string;
  clubSlug: string;
  viewerId: string;
  /** `?ronda=` de la URL (issue #408): un enlace de notificación puede
   *  apuntar a un periodo que ya no es el actual. */
  periodKey?: string;
}) {
  const [state, t] = await Promise.all([getRoundState(clubId), getTranslations("club.round")]);
  if (!state) return null;

  // Solo se resuelve como histórico si el periodo pedido existe de verdad --
  // un `ronda=` roto o de una semana sin ronda cae de vuelta al estado
  // actual en vez de dejar el bloque en blanco.
  const historicalRound =
    periodKey && periodKey !== state.periodKey
      ? await getRoundByPeriod(clubId, periodKey)
      : null;
  const isHistorical = historicalRound !== null;
  const displayPeriodKey = isHistorical ? periodKey! : state.periodKey;
  const round = isHistorical ? historicalRound : state.round;

  const supabase = await createClient();
  const summary = round
    ? (await getInteractionSummary(supabase, "club_round", [round.id])).get(round.id)
    : undefined;

  const esMiTurno = state.holderId === viewerId;
  const casaDisponible = state.dayIndex >= 3;

  return (
    <section className="flex flex-col gap-4 rounded-card border border-border bg-surface p-4 shadow-card">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-serif text-[15px] font-semibold">{t("title")}</h2>
        <span className="font-mono text-[11px] tracking-wider text-muted-foreground">
          {displayPeriodKey}
        </span>
      </div>

      {isHistorical && (
        <Link href={`/club/${clubSlug}`} className="self-start text-xs font-medium text-accent hover:underline">
          {t("backToCurrent")}
        </Link>
      )}

      {/* 03 y 04: ya hay ronda escrita este periodo (o, con `ronda=`, del
         periodo pedido -- issue #408). */}
      {round ? (
        <>
          {round.authorId === null && (
            <span className="self-start rounded-full border border-gold/35 bg-gold/15 px-2.5 py-0.5 font-mono text-[10.5px] tracking-wider text-gold-ink uppercase">
              {t("houseStamp")}
            </span>
          )}
          <p className="font-serif text-xl leading-snug font-medium text-balance">
            {round.prompt}
          </p>
          {/* La obra viaja a la RPC y se persiste (item_type/item_id), pero
             hasta aquí nadie la pintaba: se guardaba en silencio. Un enlace a
             la ficha basta -- una ronda de la casa nunca lleva obra. */}
          {round.itemType && round.itemId && (
            <Link
              href={itemHref(round.itemType, round.itemId)}
              className="self-start text-sm font-medium text-accent hover:underline"
            >
              {t("itemLink")}
            </Link>
          )}
          {round.authorName && (
            <p className="text-xs text-muted-foreground">
              {t("proposedBy", { name: round.authorName })}
            </p>
          )}
          {summary && (
            <ReviewInteractions
              interactionTargetId={summary.interactionTargetId}
              reactionCount={summary.reactionCount}
              viewerReacted={summary.viewerReacted}
              commentCount={summary.commentCount}
              comments={summary.comments}
              reactions={summary.reactions}
              viewerLoggedIn
              showTargetReaction
              clubId={clubId}
              // Firma real: (supabase, texts: string[]). Se le pasan la
              // consigna Y los cuerpos de las respuestas, igual que
              // checkpoints.ts con su chat.
              knownUsernames={await resolveKnownMentions(supabase, [
                round.prompt,
                ...summary.comments.map((c) => c.body),
              ])}
            />
          )}
        </>
      ) : esMiTurno ? (
        /* 01: te toca a ti. */
        <RoundComposer clubId={clubId} />
      ) : casaDisponible ? (
        /* 04 sin materializar: la consigna existe, su fila todavía no. Mismo
           <p> serif que el estado 03 -- issue real de la review de la Task 4:
           sin esto se anunciaba el sello y el botón "Responder" sin la
           pregunta a la vista. */
        <>
          <span className="self-start rounded-full border border-gold/35 bg-gold/15 px-2.5 py-0.5 font-mono text-[10.5px] tracking-wider text-gold-ink uppercase">
            {t("houseStamp")}
          </span>
          {state.housePrompt && (
            <p className="font-serif text-xl leading-snug font-medium text-balance">
              {state.housePrompt}
            </p>
          )}
          <RoundAnswerGate clubId={clubId} />
        </>
      ) : (
        /* 02: le toca a otro y aún tiene sus 48 h. Deliberadamente sin nada que
           responder: si aquí ya hubiera contenido, el turno no valdría nada.
           Sin holderId no hay titular -- el roster puede venir vacío en un
           club sin miembros activos -- y sin titular no hay frase que
           pintar: antes quedaba colgando "Esta semana le toca a ".

           ponytail: NO añadir aquí "el próximo: X" ni un aviso anticipado de
           turno sin materializar la rotación primero. El titular es aritmética
           sin estado (`weeks % nº_miembros`, roster por joined_at): un alta o
           baja mueve el divisor y desplaza los turnos futuros. Hoy es invisible
           —solo se anuncia el titular de ESTA semana— pero prometer el siguiente
           lo convierte en una promesa incumplida. Es el acta #396. */
        state.holderId && (
          <div className="flex flex-col gap-1">
            <p className="font-serif text-[17px] font-semibold">
              {t("waitingTitle", { name: state.holderName ?? "" })}
            </p>
            <p className="text-sm text-muted-foreground">{t("waitingSub")}</p>
          </div>
        )
      )}

      {/* Excluye `displayPeriodKey`, no siempre `state.periodKey`: viendo un
         periodo histórico (arriba), no tiene sentido repetirlo también aquí. */}
      <RoundHistory clubId={clubId} currentPeriodKey={displayPeriodKey} />
    </section>
  );
}
