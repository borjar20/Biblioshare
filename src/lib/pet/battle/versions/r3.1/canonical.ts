// JSON canónico (contrato C9): la misma estructura produce SIEMPRE los mismos
// bytes. Claves ordenadas por code units (Object.keys().sort()), sin espacios,
// solo enteros seguros. Lo ambiguo se rechaza, no se repara: un float o un
// undefined en un registro de combate es un bug del que lo construyó.

export function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "number":
      if (!Number.isSafeInteger(value)) throw new Error("CANON_NOT_INTEGER");
      return Object.is(value, -0) ? "0" : String(value);
    case "string":
      return JSON.stringify(value);
    case "object": {
      if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
      const record = value as Record<string, unknown>;
      const parts: string[] = [];
      for (const key of Object.keys(record).sort()) {
        const v = record[key];
        if (v === undefined) throw new Error("CANON_UNDEFINED");
        parts.push(JSON.stringify(key) + ":" + canonicalJson(v));
      }
      return "{" + parts.join(",") + "}";
    }
    default:
      throw new Error("CANON_TYPE");
  }
}
