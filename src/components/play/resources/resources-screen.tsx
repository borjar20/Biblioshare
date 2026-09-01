"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useResources } from "@/lib/play/resources/use-resources";
import { ResourcesConfig } from "./resources-config";
import { ResourcesBoard } from "./resources-board";

/**
 * Pantalla del acompañante «Recursos»: configuración colapsable arriba
 * (abierta al llegar sin nada; NO se auto-cierra a mitad de configuración —
 * el latch se fija UNA vez al cargar) y tablero debajo. Deshacer, reiniciar
 * valores y empezar de cero como ghosts con confirm en dos toques.
 */
export function ResourcesScreen({ identity }: { identity: string }) {
  const t = useTranslations("play.resources");
  const res = useResources(identity);
  const [configOpen, setConfigOpen] = useState<boolean | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const hasBoard =
    res.state.defs.length > 0 &&
    (res.state.players.length > 0 || res.state.defs.every((d) => d.shared));

  // Latch: se decide una vez al cargar (persistido con tablero → colapsada).
  useEffect(() => {
    if (res.loaded) setConfigOpen((prev) => (prev === null ? !hasBoard : prev));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [res.loaded]);

  if (!res.loaded) return null;
  const open = configOpen ?? !hasBoard;

  return (
    <div>
      <h1 className="font-serif text-[26px] font-semibold">{t("title")}</h1>
      <p className="mt-1 text-[14px] text-muted-foreground">{t("subtitle")}</p>

      <button
        type="button"
        aria-expanded={open}
        onClick={() => setConfigOpen(!open)}
        className="mt-4 rounded-chip border border-border px-3 py-1.5 text-[13px] font-semibold"
      >
        {t("configure")}
      </button>
      {open ? (
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
