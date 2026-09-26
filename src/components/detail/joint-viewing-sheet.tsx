"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ItemType } from "@/lib/catalog/types";
import {
  createJointViewing,
  leaveJointViewing,
  loadJointViewingOptions,
  type JointActionError,
  type JointViewingOptions,
} from "@/lib/social/joint-viewing-actions";
import { UserAvatar } from "@/components/social/user-avatar";
import { Button } from "@/components/ui/button";
import { JointCompanionsPicker } from "@/components/detail/joint-companions-picker";

// «Lo disfruté con…» (#1220): etiqueta a seguidos mutuos en un pase terminado.
// Cada invitado recibe un aviso y decide; hasta que acepta no aparece en nada.
// Si el pase ya está en un visionado, la hoja enseña con quién y deja salirse
// (o, a quien lo creó, invitar a más).
//
// Mismo <dialog> nativo que new-pass-sheet.tsx: foco atrapado y Escape gratis;
// el evento "close" es la única vía de aviso al padre.
export function JointViewingSheet({
  passId,
  itemType,
  itemId,
  open,
  onClose,
}: {
  passId: string;
  itemType: ItemType;
  itemId: string;
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("passes.jointSheet");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [options, setOptions] = useState<JointViewingOptions | null | "loading">("loading");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<JointActionError | "load" | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    loadJointViewingOptions(passId).then((result) => {
      if (cancelled) return;
      setOptions(result);
      if (!result) setError("load");
    });
    return () => {
      cancelled = true;
    };
  }, [open, passId]);

  const current = options && options !== "loading" ? options.current : null;
  const alreadyIn = new Set(current?.others.map((m) => m.userId) ?? []);
  // Quien no creó el visionado no invita: solo ve con quién está y puede salirse.
  const canInvite = !current || current.isCreator;
  const candidates =
    options && options !== "loading" ? options.mutuals.filter((m) => !alreadyIn.has(m.userId)) : [];

  function toggle(userId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await createJointViewing(passId, itemType, itemId, [...selected]);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDone(true);
      setSelected(new Set());
      setOptions(await loadJointViewingOptions(passId));
    });
  }

  function leave() {
    if (!current || !window.confirm(t("leaveConfirm"))) return;
    setError(null);
    startTransition(async () => {
      const result = await leaveJointViewing(current.viewingId, itemType, itemId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      dialogRef.current?.close();
    });
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      aria-labelledby="joint-sheet-title"
      className="m-auto w-[min(420px,92vw)] rounded-card border border-border bg-surface p-0 text-foreground shadow-card backdrop:bg-scrim"
      onClick={(event) => {
        if (event.target === dialogRef.current) dialogRef.current?.close();
      }}
    >
      <div className="flex max-h-[80vh] flex-col">
        <div className="border-b border-border px-5 py-4">
          <h2 id="joint-sheet-title" className="font-serif text-lg font-semibold">
            {t(`title.${itemType}`)}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("hint")}</p>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 py-4">
          {options === "loading" && <p className="text-sm text-muted-foreground">{t("loading")}</p>}

          {current && current.others.length > 0 && (
            <section className="flex flex-col gap-2">
              <h3 className="label-section">{t("currentTitle")}</h3>
              <ul className="flex flex-col gap-1.5">
                {current.others.map((m) => (
                  <li key={m.userId} className="flex items-center gap-2 text-sm">
                    <UserAvatar name={m.displayName || m.username} avatarUrl={m.avatarUrl} size={24} />
                    <Link href={`/u/${m.username}`} className="min-w-0 flex-1 truncate hover:underline">
                      {m.displayName || m.username}
                    </Link>
                    <span className="font-mono text-[10px] tracking-wide uppercase text-muted-foreground">
                      {t(`status.${m.status}`)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {options && options !== "loading" && canInvite && (
            <section className="flex flex-col gap-2">
              {current && <h3 className="label-section">{t("inviteMore")}</h3>}
              <JointCompanionsPicker people={candidates} selected={selected} onToggle={toggle} />
            </section>
          )}

          {done && <p className="text-sm text-status-completed-ink">{t("sent")}</p>}
          {error && <p className="text-sm text-status-dropped">{t(`errors.${error}`)}</p>}
        </div>

        <div className="flex flex-col gap-2 border-t border-border px-5 py-4">
          {canInvite && candidates.length > 0 && (
            <Button type="button" disabled={pending || selected.size === 0} onClick={submit}>
              {pending ? t("sending") : t("submit", { count: selected.size })}
            </Button>
          )}
          {current && (
            <Button type="button" variant="secondary" disabled={pending} onClick={leave}>
              {t("leave")}
            </Button>
          )}
          <Button type="button" variant="secondary" disabled={pending} onClick={() => dialogRef.current?.close()}>
            {t("close")}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
