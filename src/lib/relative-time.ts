// Tiempo relativo compacto ("hace 2 horas") compartido por la campana de
// notificaciones y el feed. Función pura de módulo: puede llamarse desde el
// render de un client component sin disparar react-hooks/purity, pero el nodo
// que la pinte debe llevar suppressHydrationWarning (el valor SSR puede
// diferir del cliente). `t` debe ser un useTranslations("time").
//
// Un `iso` date-only ("YYYY-MM-DD", sin hora) —los eventos backdateados: sesión
// de un día pasado, reseña/episodio que no es de hoy— se ancla a medianoche
// LOCAL, no a la UTC que le daría `new Date("2026-07-20")`: al este de UTC ese
// desfase (2 h en Madrid en verano) arrancaba el "hace X" adelantado y se
// arrastraba el resto del día (issue #351). El caso de HOY ya llega con hora
// real vía sessionRelativeBasis, así que no entra por aquí.
export function timeAgo(
  iso: string,
  t: (key: string, values?: Record<string, number>) => string,
): string {
  const at = iso.length === 10 ? new Date(`${iso}T00:00:00`) : new Date(iso);
  const minutes = Math.floor((Date.now() - at.getTime()) / 60000);
  if (minutes < 1) return t("justNow");
  if (minutes < 60) return t("minutesAgo", { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("hoursAgo", { count: hours });
  return t("daysAgo", { count: Math.floor(hours / 24) });
}
