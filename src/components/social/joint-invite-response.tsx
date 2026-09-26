"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import type { ItemType } from "@/lib/catalog/types";
import { respondJointViewing, type JointActionError } from "@/lib/social/joint-viewing-actions";
import { Button } from "@/components/ui/button";

// Respuesta a una invitación de visionado conjunto (#1220). Aceptar enlaza UNO
// de tus pases terminados de la obra (o crea uno nuevo con la fecha del
// visionado); la preselección es el que cae ese mismo día, si lo hay, porque es
// casi seguro el mismo visionado. «No fui yo» rechaza y no vuelve a preguntar.
export function JointInviteResponse({
  viewingId,
  itemType,
  itemHref,
  watchedOn,
  linkablePasses,
}: {
  viewingId: string;
  itemType: ItemType;
  itemHref: string;
  watchedOn: string | null;
  linkablePasses: { id: string; finishedOn: string | null }[];
}) {
  const t = useTranslations("joint");
  const format = useFormatter();
  const router = useRouter();
  const sameDay = watchedOn ? linkablePasses.find((p) => p.finishedOn === watchedOn) : undefined;
  const [choice, setChoice] = useState<string>(sameDay?.id ?? "new");
  const [error, setError] = useState<JointActionError | null>(null);
  const [answered, setAnswered] = useState<"accepted" | "declined" | null>(null);
  const [pending, startTransition] = useTransition();

  function respond(accept: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await respondJointViewing(viewingId, accept, accept ? choice : "new");
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setAnswered(accept ? "accepted" : "declined");
      router.refresh();
    });
  }

  if (answered === "accepted") {
    return (
      <p className="text-sm text-status-completed-ink">
        {t("acceptedNow")}{" "}
        <Link href={itemHref} className="text-foreground underline">
          {t("rateLink")}
        </Link>
      </p>
    );
  }
  if (answered === "declined") return <p className="text-sm text-muted-foreground">{t("declinedHint")}</p>;

  return (
    <section className="flex flex-col gap-3 border-t border-border pt-4">
      <h2 className="font-serif text-base font-semibold">{t(`question.${itemType}`)}</h2>

      {linkablePasses.length > 0 && (
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1 text-sm text-muted-foreground">{t("whichPass")}</legend>
          {linkablePasses.map((p) => (
            <label key={p.id} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="joint-pass"
                value={p.id}
                checked={choice === p.id}
                onChange={() => setChoice(p.id)}
                className="accent-accent"
              />
              {p.finishedOn
                ? t("passOn", { date: format.dateTime(new Date(p.finishedOn), { day: "numeric", month: "short", year: "numeric" }) })
                : t("passUndated")}
            </label>
          ))}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="joint-pass"
              value="new"
              checked={choice === "new"}
              onChange={() => setChoice("new")}
              className="accent-accent"
            />
            {t("passNew")}
          </label>
        </fieldset>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={pending} onClick={() => respond(true)}>
          {pending ? t("sending") : t("accept")}
        </Button>
        <Button type="button" variant="secondary" disabled={pending} onClick={() => respond(false)}>
          {t("decline")}
        </Button>
      </div>
      {error && <p className="text-sm text-status-dropped">{t(`errors.${error}`)}</p>}
    </section>
  );
}
