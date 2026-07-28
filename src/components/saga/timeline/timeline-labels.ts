// Las sub-piezas del timeline son funciones PLANAS, no componentes `async`:
// reciben las etiquetas ya resueltas. La cáscara llama a `getTranslations` una
// vez y construye esto; así una fila no dispara una resolución de traducciones
// por cada tarjeta pintada.
export type TimelineLabels = {
  orderNo: (n: number) => string;
  branchRequisite: string;
  tandemTitle: string;
  tandemCount: (count: number) => string;
  windowTitle: string;
  windowAfter: (title: string) => string;
  windowBefore: (title: string) => string;
  windowFree: string;
};

type Translator = (key: string, values?: Record<string, string | number>) => string;

export function buildTimelineLabels(t: Translator): TimelineLabels {
  return {
    orderNo: (n) => t("orderNo", { n }),
    branchRequisite: t("branchRequisite"),
    tandemTitle: t("timelineTandemTitle"),
    tandemCount: (count) => t("timelineTandemCount", { count }),
    windowTitle: t("timelineWindowTitle"),
    windowAfter: (title) => t("timelineWindowAfter", { title }),
    windowBefore: (title) => t("timelineWindowBefore", { title }),
    windowFree: t("timelineWindowFree"),
  };
}
