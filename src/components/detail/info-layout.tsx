import type { ReactNode } from "react";

// Las fichas ordenan sus secciones con order-N. Los dos slots comparten
// columna para dejar sitio al panel de comunidad en las pantallas grandes.
export function InfoLayout({ main, aside }: { main: ReactNode; aside: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-8">
      <div data-testid="info-main" className="contents">{main}</div>
      <div data-testid="info-aside" className="contents">{aside}</div>
    </div>
  );
}
