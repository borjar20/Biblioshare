"use client";

import { useMemo, useState } from "react";
import { useSequenceDraft } from "./use-sequence-draft";
import { ShellDesktop } from "./shell-desktop";
import { ShellMobile } from "./shell-mobile";
import { RowSheet } from "./row-sheet";
import { TandemPicker } from "./tandem-picker";
import { SequenceSaveBar } from "./sequence-save-bar";
import { EditorLeftPanel } from "@/components/saga/editor/editor-left-panel";
import type { PickedItem } from "@/components/clubs/item-picker";
import { setParentSaga } from "@/lib/sagas/curation-actions";
import { isSagaAccentToken, type SagaAccentToken } from "@/lib/sagas/accents";
import { anchorKey, type DraftAnchor, type DraftEntry, type SequenceDraft, type ZoneId } from "@/lib/sagas/sequence-draft";

type ChildSagaData = { id: string; name: string; accentColor: string | null; count: number };

const resolveAccent = (accentColor: string | null): SagaAccentToken =>
  isSagaAccentToken(accentColor) ? accentColor : "terracota";

/** Alta desde el buscador de catálogo del rail. `isNew` lo pone `addEntry`. */
const entryFromPickedItem = (item: PickedItem): DraftEntry => ({
  key: `i:${item.itemType}:${item.itemId}`,
  kind: "item", itemType: item.itemType, itemId: item.itemId, childSagaId: null,
  title: item.title, coverUrl: item.coverUrl, accentColor: null, count: null,
  optional: false, role: null, window: null, isNew: false,
});

const entryFromChildSaga = (child: ChildSagaData): DraftEntry => ({
  key: `s:${child.id}`,
  kind: "block", itemType: null, itemId: null, childSagaId: child.id,
  title: child.name, coverUrl: null, accentColor: child.accentColor, count: child.count,
  optional: false, role: null, window: null, isNew: false,
});

// Las dos cáscaras se montan A LA VEZ y se ocultan por breakpoint (regla de los
// dos árboles, docs/redesign/README.md), pero comparten `useSequenceDraft`: hay
// dos árboles de PRESENTACIÓN y un solo borrador. Duplicar el estado sería el
// fallo que esa regla avisa que el patrón no cubre.
export function SequenceEditor({
  sagaId, initial, childSagas, anchors, itineraries,
}: {
  sagaId: string;
  initial: SequenceDraft;
  childSagas: Array<{ id: string; name: string; accentColor: string | null; count: number }>;
  /** Anclas válidas del subárbol entero (`getAnchorOptions`, fase 2b),
   *  resueltas en servidor — objetos planos, así que cruzan la frontera
   *  servidor→cliente sin problema (un `Map` no lo haría). Se pasa la lista
   *  ENTERA, no solo las claves: `AnchorPicker` necesita el `title` de cada
   *  una para pintar el selector, y `anchorKeys` (abajo) se deriva de esta
   *  misma lista en vez de mandar las dos cosas por separado.
   *
   *  Congelada del render del servidor: anidar un bloque nuevo en la misma
   *  sesión no la actualiza (a diferencia de `childIds`, que sí es un Set en
   *  vivo vía `children`). Aceptado — no se inventa un refresco — con tal de
   *  no repetir el `foreignBlock` falso de la fase 2a: la comprobación local
   *  de `useSequenceDraft` nunca debe acusar de ajena una ancla real. */
  anchors: DraftAnchor[];
  /** Contenido de servidor sin callbacks, así que sí puede viajar como nodo
   *  (al contrario que el rail, que necesita ligar `onAddItem` al borrador). */
  itineraries: React.ReactNode;
}) {
  const [menuKey, setMenuKey] = useState<string | null>(null);
  const [pairKey, setPairKey] = useState<string | null>(null);

  // El rail se monta AQUÍ, no en la página: `EditorLeftPanel` es cliente y sus
  // callbacks tienen que ligarse al borrador, y una función no cruza la
  // frontera servidor→cliente.
  const [children, setChildren] = useState(childSagas);
  // Ids de hijas permitidos como bloque, derivados de `children` (el estado que
  // el rail SÍ mantiene con `setChildren`), no de un prop `childIds` congelado
  // en el primer render: crear o anidar una subsaga desde el rail actualiza
  // `children` pero nunca actualizaba ese prop, así que `validateSequenceDraft`
  // rechazaba con `foreignBlock` un bloque recién añadido que sí era válido.
  // `useMemo` evita invalidar los memos de `useSequenceDraft` en cada render
  // pasando un array nuevo con el mismo contenido.
  const childIds = useMemo(() => children.map((c) => c.id), [children]);
  const anchorKeys = useMemo(() => anchors.map(anchorKey), [anchors]);
  const { draft, ops, save, status, error, unclassified } = useSequenceDraft(initial, sagaId, childIds, anchorKeys);
  const rail = (
    <EditorLeftPanel
      sagaId={sagaId}
      childSagas={children.map((c) => ({ id: c.id, name: c.name, accentColor: c.accentColor }))}
      accentBySaga={new Map(children.map((c) => [c.id, resolveAccent(c.accentColor)]))}
      countBySaga={new Map(children.map((c) => [c.id, c.count]))}
      onAddItem={(item: PickedItem) => ops.add(entryFromPickedItem(item))}
      onAddBlock={(child: { id: string; name: string }) =>
        ops.add(entryFromChildSaga(children.find((c) => c.id === child.id) ?? { ...child, accentColor: null, count: 0 }))
      }
      onChildrenChange={(next) =>
        setChildren(next.map((c) => ({ ...c, count: children.find((p) => p.id === c.id)?.count ?? 0 })))
      }
      // Desanidar es acción inmediata (cambia `parent_saga_id`), no una
      // operación del borrador. Al quitarlo del borrador NO se genera un
      // DELETE: `toPayload` solo lleva a `removed` las claves `i:`, así que un
      // bloque desaparece de la secuencia sin que el RPC toque `saga_items`.
      onUnnestChild={async (childId: string) => {
        const result = await setParentSaga(childId, null);
        if (result.error) return result;
        ops.remove(`s:${childId}`);
        setChildren((cur) => cur.filter((c) => c.id !== childId));
        return {};
      }}
    />
  );

  const locate = (key: string): { zone: ZoneId; slotNumber: number | null; slotIndex: number | null } => {
    const i = draft.slots.findIndex((s) => s.some((e) => e.key === key));
    if (i !== -1) return { zone: "sequence", slotNumber: i + 1, slotIndex: i };
    if (draft.free.some((e) => e.key === key)) return { zone: "free", slotNumber: null, slotIndex: null };
    return { zone: "unclassified", slotNumber: null, slotIndex: null };
  };

  const all = [...draft.slots.flat(), ...draft.free, ...draft.unclassified];
  const active = menuKey ? all.find((e) => e.key === menuKey) ?? null : null;
  const here = menuKey ? locate(menuKey) : null;

  return (
    <>
      <div className="hidden lg:block">
        <ShellDesktop draft={draft} ops={ops} anchors={anchors} onMenu={setMenuKey} rail={rail} itineraries={itineraries} />
      </div>
      <div className="lg:hidden">
        <ShellMobile draft={draft} ops={ops} anchors={anchors} onMenu={setMenuKey} rail={rail} itineraries={itineraries} />
      </div>

      {active && here && (
        <RowSheet
          entry={active}
          zone={here.zone}
          slotNumber={here.slotNumber}
          canMoveUp={here.slotIndex !== null && here.slotIndex > 0}
          canMoveDown={here.slotIndex !== null && here.slotIndex < draft.slots.length - 1}
          onZone={(z) => { ops.sendTo(active.key, z); setMenuKey(null); }}
          onRole={(r) => ops.setRole(active.key, r)}
          onOptional={(v) => ops.setOptional(active.key, v)}
          onMove={(delta) => here.slotIndex !== null && ops.moveSlot(here.slotIndex, delta)}
          onPair={() => { setPairKey(active.key); setMenuKey(null); }}
          onRemove={() => { ops.remove(active.key); setMenuKey(null); }}
          onClose={() => setMenuKey(null)}
        />
      )}

      {pairKey && (
        <TandemPicker
          entryKey={pairKey}
          slots={draft.slots}
          onPair={(i) => { ops.pairWith(pairKey, i); setPairKey(null); }}
          onCancel={() => setPairKey(null)}
        />
      )}

      <SequenceSaveBar status={status} unclassified={unclassified} error={error} onSave={save} />
    </>
  );
}
