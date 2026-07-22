"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import type { ItemType } from "@/lib/catalog/types";
import { updateSagaMember, type UpdateMemberState } from "@/lib/sagas/member-actions";
import type { SagaItemRole } from "@/lib/sagas/types";

export type EditableMember = {
  // La saga REAL dueña de esta membresía (ver comentario en editar/page.tsx):
  // puede ser una subsaga distinta a la que se está editando, así que viaja
  // por miembro y no como prop compartida — bindearla mal hace que el guardado
  // falle en silencio con `notMember`.
  sagaId: string;
  itemType: ItemType;
  itemId: string;
  title: string;
  position: number | null;
  role: SagaItemRole | null;
};

const ROLES: SagaItemRole[] = ["precuela", "spin_off", "relato", "paralela"];

function MemberRow({ member }: { member: EditableMember }) {
  const t = useTranslations("saga");
  const [state, formAction, pending] = useActionState<UpdateMemberState, FormData>(
    updateSagaMember.bind(null, member.sagaId, member.itemType, member.itemId),
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-2 border-t border-border py-3">
      <p className="text-[13px] font-semibold">{member.title}</p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
            {t("memberPosition")}
          </span>
          <input
            name="position"
            type="number"
            min={1}
            defaultValue={member.position ?? ""}
            placeholder={t("memberPositionNone")}
            className="w-32 rounded-lg border border-border bg-surface px-2 py-1.5 text-[13px]"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
            {t("memberRole")}
          </span>
          <select
            name="role"
            defaultValue={member.role ?? ""}
            className="rounded-lg border border-border bg-surface px-2 py-1.5 text-[13px]"
          >
            <option value="">{t("memberRoleNone")}</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {t(`roleLabel.${r}`)}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg border border-border px-3 py-1.5 text-[12px] font-semibold disabled:opacity-50"
        >
          {t("memberSave")}
        </button>
        {state.ok && <span className="text-[12px] text-green">{t("memberSaved")}</span>}
      </div>
      {state.error && (
        <p className="text-[12px] text-red-600">{t(`memberErrors.${state.error}`)}</p>
      )}
    </form>
  );
}

// Curación de miembros (issue #167). Vive en la ficha de la saga y no en la del
// libro a propósito: el gesto real es "curo ESTA saga y veo sus obras", y esta
// pantalla no exige haber montado un grafo — que es justo la tesis de la issue.
export function SagaMembersEditor({ members }: { members: EditableMember[] }) {
  const t = useTranslations("saga");
  return (
    <section id="miembros" className="flex flex-col gap-1">
      <h2 className="font-serif text-lg font-semibold">{t("membersTitle")}</h2>
      <p className="text-[12px] leading-snug text-muted-foreground">{t("membersHint")}</p>
      {members.length === 0 ? (
        <p className="mt-2 text-[13px] text-muted-foreground">{t("membersEmpty")}</p>
      ) : (
        <div className="mt-1">
          {members.map((m) => (
            <MemberRow key={`${m.sagaId}-${m.itemType}-${m.itemId}`} member={m} />
          ))}
        </div>
      )}
    </section>
  );
}
