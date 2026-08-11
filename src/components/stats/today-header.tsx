import { todayDateLabel } from "@/lib/stats/dates";

// La cabecera del bloque de hoy: la fecha en mono y el título en serif. El
// título cambia por estado ("¿Qué has disfrutado hoy?", "¿Qué te apetece
// hoy?", "¿Qué empezamos?", "Encuentra algo para disfrutar"), así que llega
// como prop ya traducida en vez de resolverse aquí.
export function TodayHeader({ title }: { title: string }) {
  return (
    <div>
      <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-muted-foreground">
        {todayDateLabel()}
      </p>
      <h2 className="mt-1.5 font-serif text-[26px] leading-[1.02] font-semibold tracking-[-0.01em]">
        {title}
      </h2>
    </div>
  );
}
