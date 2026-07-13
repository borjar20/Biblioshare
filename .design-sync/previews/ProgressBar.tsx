import { ProgressBar } from "@/components/ui/progress-bar";

export function Default() {
  return <ProgressBar current={7} total={20} label="7 de 20 capítulos" />;
}

export function Empty() {
  return <ProgressBar current={0} total={20} label="Sin empezar" />;
}

export function Complete() {
  return <ProgressBar current={20} total={20} label="Completado" />;
}
