"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useResources } from "@/lib/play/resources/use-resources";
import { ResourcesConfig } from "./resources-config";
import { ResourcesBoard } from "./resources-board";

type Resources = ReturnType<typeof useResources>;
type T = ReturnType<typeof useTranslations>;

/** Pantalla del acompañante «Recursos»: configuración y tablero local-first. */
export function ResourcesScreen({ identity }: { identity: string }) {
  const t = useTranslations("play.resources");
  const res = useResources(identity);
  const hasBoard =
    res.state.defs.length > 0 &&
    (res.state.players.length > 0 || res.state.defs.some((d) => d.shared));

  // Al llegar el snapshot se monta un hijo cuyo estado inicial queda fijado
  // para toda la configuración, sin sincronizarlo con un efecto.
  if (!res.loaded) return null;
  return <LoadedResourcesScreen key={identity} identity={identity} t={t} res={res} hasBoard={hasBoard} />;
}

function LoadedResourcesScreen({
  identity,
  t,
  res,
  hasBoard,
}: {
  identity: string;
  t: T;
  res: Resources;
  hasBoard: boolean;
}) {
  const [configOpen, setConfigOpen] = useState(() => !hasBoard);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  return (
    <div>
      <h1 className="font-serif text-[26px] font-semibold">{t("title")}</h1>
      <p className="mt-1 text-[14px] text-muted-foreground">{t("subtitle")}</p>

      <button
        type="button"
        aria-expanded={configOpen}
        onClick={() => setConfigOpen(!configOpen)}
        className="mt-4 rounded-chip border border-border px-3 py-1.5 text-[13px] font-semibold"
      >
        {t("configure")}
      </button>
      {configOpen ? (
        <div className="mt-3">
          <ResourcesConfig identity={identity} state={res.state} emit={res.emit} />
        </div>
      ) : null}

      <div className="mt-5">
        {hasBoard ? (
          <ResourcesBoard state={res.state} emit={res.emit} />
        ) : (
          <p className="text-center text-[14px] text-muted-foreground">{t("emptyHint")}</p>
        )}
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-center gap-4">
        <button
          type="button"
          onClick={res.undo}
          disabled={!res.canUndo}
          className="-my-2 p-2 text-[12px] text-muted-foreground underline disabled:opacity-40"
        >
          {t("undo")}
        </button>
        {confirmReset ? (
          <button
            type="button"
            onClick={() => {
              res.emit("values_reset", {});
              setConfirmReset(false);
            }}
            className="-my-2 p-2 text-[12px] text-play-danger underline"
          >
            {t("resetConfirm")}
          </button>
        ) : (
          <button
            type="button"
            disabled={res.state.defs.length === 0}
            onClick={() => setConfirmReset(true)}
            className="-my-2 p-2 text-[12px] text-muted-foreground underline disabled:opacity-40"
          >
            {t("reset")}
          </button>
        )}
        {confirmClear ? (
          <button
            type="button"
            onClick={() => {
              res.clear();
              setConfirmClear(false);
              setConfigOpen(true);
            }}
            className="-my-2 p-2 text-[12px] text-play-danger underline"
          >
            {t("clearConfirm")}
          </button>
        ) : (
          <button
            type="button"
            disabled={res.state.defs.length === 0 && res.state.players.length === 0}
            onClick={() => setConfirmClear(true)}
            className="-my-2 p-2 text-[12px] text-muted-foreground underline disabled:opacity-40"
          >
            {t("clear")}
          </button>
        )}
      </div>
    </div>
  );
}
