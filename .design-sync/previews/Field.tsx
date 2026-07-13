import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function Default() {
  return (
    <Field label="Título" htmlFor="ds-field-title" hint="Tal como aparece en la portada.">
      <Input id="ds-field-title" placeholder="Título del libro" />
    </Field>
  );
}

export function WithoutHint() {
  return (
    <Field label="Autor" htmlFor="ds-field-author">
      <Input id="ds-field-author" placeholder="Nombre del autor" />
    </Field>
  );
}
