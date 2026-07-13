import { Button } from "@/components/ui/button";

export function Default() {
  return <Button>Guardar cambios</Button>;
}

export function Variants() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="primary">Primario</Button>
      <Button variant="secondary">Secundario</Button>
      <Button variant="ghost">Ghost</Button>
    </div>
  );
}

export function Disabled() {
  return <Button disabled>Guardando…</Button>;
}
