import { Input } from "@/components/ui/input";

export function Default() {
  return <Input placeholder="Título del libro" />;
}

export function Filled() {
  return <Input defaultValue="Cien años de soledad" readOnly />;
}

export function Disabled() {
  return <Input disabled defaultValue="No editable" />;
}
