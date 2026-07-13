import { CircularProgress } from "@/components/stats/circular-progress";

export function Default() {
  return (
    <CircularProgress value={45} total={60} label="45" label2="60" caption="minutos hoy" />
  );
}

export function MediaAccents() {
  return (
    <div className="flex items-center gap-4">
      <CircularProgress value={8} total={12} label="8" label2="12" caption="libros" color="var(--type-book)" />
      <CircularProgress value={5} total={10} label="5" label2="10" caption="películas" color="var(--type-movie)" />
      <CircularProgress value={3} total={6} label="3" label2="6" caption="series" color="var(--type-series)" />
    </div>
  );
}

export function Complete() {
  return <CircularProgress value={60} total={60} label="60" label2="60" caption="objetivo cumplido" />;
}
