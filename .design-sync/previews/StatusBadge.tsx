import { StatusBadge } from "@/components/ui/status-badge";

export function Default() {
  return <StatusBadge status="in_progress" label="Leyendo" />;
}

export function AllStatuses() {
  return (
    <div className="flex flex-wrap gap-2">
      <StatusBadge status="planned" label="Pendiente" />
      <StatusBadge status="in_progress" label="Leyendo" />
      <StatusBadge status="completed" label="Completado" />
      <StatusBadge status="dropped" label="Abandonado" />
    </div>
  );
}
