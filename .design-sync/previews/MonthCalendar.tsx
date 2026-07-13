import "@/design-sync-shims/process-shim";
import { MonthCalendar } from "@/components/stats/month-calendar";
import { PreviewProvider } from "@/design-sync-shims/preview-provider";
import type { MonthCalendar as MonthCalendarData } from "@/lib/stats/types";

const COVER =
  "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMDAiIGhlaWdodD0iNDUwIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjYjQ1MzA5Ii8+PC9zdmc+";

// Ten scattered "reading days" in July 2026, three of them with a cover.
const ACTIVE_DAYS = new Set([2, 3, 4, 9, 10, 15, 16, 22, 23, 28]);
const COVER_DAYS = new Set([3, 16, 23]);

function buildMonth(): MonthCalendarData {
  const days = Array.from({ length: 31 }, (_, i) => {
    const day = i + 1;
    const active = ACTIVE_DAYS.has(day);
    return {
      date: `2026-07-${String(day).padStart(2, "0")}`,
      active,
      coverUrl: active && COVER_DAYS.has(day) ? COVER : null,
    };
  });
  return { month: "2026-07", days, prevMonth: "2026-06", nextMonth: "2026-08" };
}

export function Default() {
  return (
    <PreviewProvider>
      <MonthCalendar initialCalendar={buildMonth()} basePath="/" />
    </PreviewProvider>
  );
}
