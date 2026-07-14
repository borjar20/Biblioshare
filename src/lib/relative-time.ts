// Tiempo relativo compacto ("hace 2 horas") compartido por la campana de
// notificaciones y el feed. Función pura de módulo: puede llamarse desde el
// render de un client component sin disparar react-hooks/purity, pero el nodo
// que la pinte debe llevar suppressHydrationWarning (el valor SSR puede
// diferir del cliente). `t` debe ser un useTranslations("time").
export function timeAgo(
  iso: string,
  t: (key: string, values?: Record<string, number>) => string,
): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return t("justNow");
  if (minutes < 60) return t("minutesAgo", { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("hoursAgo", { count: hours });
  return t("daysAgo", { count: Math.floor(hours / 24) });
}
