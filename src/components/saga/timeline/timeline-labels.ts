// Las sub-piezas del timeline son funciones PLANAS, no componentes `async`:
// reciben las etiquetas ya resueltas. La cáscara llama a `getTranslations` una
// vez y construye esto; así una fila no dispara una resolución de traducciones
// por cada tarjeta pintada.
export type TimelineLabels = {
  orderNo: (n: number) => string;
  branchRequisite: string;
  tandemTitle: string;
  tandemCount: (count: number) => string;
  tandemModeSimultaneo: string;
  tandemModeIndistinto: string;
  windowTitle: string;
  windowAfter: (title: string) => string;
  windowBefore: (title: string) => string;
  windowFree: string;
  windowReason: (reason: "spoiler" | "contexto") => string;
  windowNotice: (notice: "antes" | "dentro" | "pasada") => string;
  windowTrackAria: (title: string) => string;
  windowTrackStart: string;
  windowTrackEnd: string;
};

type Translator = (key: string, values?: Record<string, string | number>) => string;

export function buildTimelineLabels(t: Translator): TimelineLabels {
  return {
    orderNo: (n) => t("orderNo", { n }),
    branchRequisite: t("branchRequisite"),
    tandemTitle: t("timelineTandemTitle"),
    tandemCount: (count) => t("timelineTandemCount", { count }),
    tandemModeSimultaneo: t("timelineTandemSimultaneo"),
    tandemModeIndistinto: t("timelineTandemIndistinto"),
    windowTitle: t("timelineWindowTitle"),
    windowAfter: (title) => t("timelineWindowAfter", { title }),
    windowBefore: (title) => t("timelineWindowBefore", { title }),
    windowFree: t("timelineWindowFree"),
    windowReason: (reason) =>
      reason === "spoiler" ? t("timelineWindowReasonSpoiler") : t("timelineWindowReasonContexto"),
    windowNotice: (notice) =>
      notice === "antes"
        ? t("timelineWindowNoticeAntes")
        : notice === "dentro"
          ? t("timelineWindowNoticeDentro")
          : t("timelineWindowNoticePasada"),
    windowTrackAria: (title) => t("timelineWindowTrackAria", { title }),
    windowTrackStart: t("timelineWindowTrackStart"),
    windowTrackEnd: t("timelineWindowTrackEnd"),
  };
}
