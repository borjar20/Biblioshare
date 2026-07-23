"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import type { ItemType } from "@/lib/catalog/types";
import { updateSagaMember, type UpdateMemberState } from "@/lib/sagas/member-actions";
import type { SagaItemRole } from "@/lib/sagas/types";

export type EditableMember = {
  // La saga REAL dueña de esta membresía en `saga_items` (= DetailMember.ownerSagaId,
  // ver editar/page.tsx y types.ts): puede ser una subsaga distinta a la que
  // se está editando, así que viaja por miembro y no como prop compartida —
  // bindearla mal hace que el guardado falle en silencio con `notMember`.
  ownerSagaId: string;
  itemType: ItemType;
  itemId: string;
  title: string;
  position: number | null;
  role: SagaItemRole | null;
};

const ROLES: SagaItemRole[] = ["precuela", "spin_off", "relato", "paralela"];

function MemberRow({ member, editorSagaId }: { member: EditableMember; editorSagaId: string }) {
  const t = useTranslations("saga");
  const [state, formAction, pending] = useActionState<UpdateMemberState, FormData>(
    updateSagaMember.bind(null, member.ownerSagaId, editorSagaId, member.itemType, member.itemId),
    {},
  );

  // Hallazgo 1 (revisión Task 8): React 19 resetea los campos NO controlados
  // de un <form action={fn}> a su `defaultValue` tras una acción con éxito.
  // Si ese `defaultValue` sigue siendo la prop original (obsoleta), el reset
  // deja el campo mostrando un valor viejo que un segundo Guardar reenvía sin
  // que nadie lo toque — pérdida silenciosa del dato recién guardado. La
  // salida NO es controlar el input (rehace el formulario del brief) ni
  // confiar solo en la revalidación de la ruta (esta misma fila puede
  // remontar antes de que la navegación refresque las props del servidor):
  // se deriva el valor "actual" de `state.saved` —lo que el propio action
  // acaba de confirmar que quedó en BD— y se fuerza un remount del campo con
  // una `key` derivada de ESE valor. Un remount siempre aplica el
  // `defaultValue` fresco, así que el reset de React ya no tiene nada
  // obsoleto que restaurar: el campo remontado YA está en el valor guardado.
  const current = state.saved ?? { position: member.position, role: member.role };

  return (
    <form action={formAction} className="flex flex-col gap-2 border-t border-border py-3">
      <p className="text-[13px] font-semibold">{member.title}</p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
            {t("memberPosition")}
          </span>
          <input
            key={`position-${current.position ?? ""}`}
            name="position"
            type="number"
            min={1}
            defaultValue={current.position ?? ""}
            placeholder={t("memberPositionNone")}
            className="w-32 rounded-lg border border-border bg-surface px-2 py-1.5 text-[13px]"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
            {t("memberRole")}
          </span>
          <select
            key={`role-${current.role ?? ""}`}
            name="role"
            defaultValue={current.role ?? ""}
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
export function SagaMembersEditor({
  sagaId,
  members,
}: {
  // La saga cuya página /editar es ESTA (la raíz de la ruta /saga/<sagaId>/editar,
  // no la dueña de cada fila — eso es `EditableMember.ownerSagaId`, que puede
  // ser una subsaga distinta). Se pasa al action para que revalide esta misma
  // ruta (hallazgo 1, revisión Task 8).
  sagaId: string;
  members: EditableMember[];
}) {
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
            <MemberRow
              key={`${m.ownerSagaId}-${m.itemType}-${m.itemId}`}
              member={m}
              editorSagaId={sagaId}
            />
          ))}
        </div>
      )}
    </section>
  );
}
