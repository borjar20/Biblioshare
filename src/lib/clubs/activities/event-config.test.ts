import { describe, expect, it } from "vitest";
import {
  parseEventConfig,
  validateEventConfig,
  CLUB_EVENT_TYPES,
  CLUB_EVENT_MEDIA,
} from "./event-config";

describe("parseEventConfig — degrada, nunca lanza", () => {
  it("config null cae a otro", () => {
    expect(parseEventConfig(null)).toEqual({ eventType: "otro" });
  });

  it("objeto vacío cae a otro", () => {
    expect(parseEventConfig({})).toEqual({ eventType: "otro" });
  });

  it("un array no es una config", () => {
    expect(parseEventConfig([1, 2] as never)).toEqual({ eventType: "otro" });
  });

  it("eventType desconocido cae a otro — una versión futura no rompe el calendario", () => {
    expect(parseEventConfig({ eventType: "concierto" })).toEqual({ eventType: "otro" });
  });

  it("quedada se conserva y NUNCA arrastra medio", () => {
    expect(parseEventConfig({ eventType: "quedada", medium: "movie" })).toEqual({
      eventType: "quedada",
    });
  });

  it("estreno con medio válido se conserva entero", () => {
    expect(parseEventConfig({ eventType: "estreno", medium: "movie" })).toEqual({
      eventType: "estreno",
      medium: "movie",
    });
  });

  it("estreno SIN medio degrada a otro — un estreno sin medio no puede colorearse", () => {
    expect(parseEventConfig({ eventType: "estreno" })).toEqual({ eventType: "otro" });
  });

  it("estreno con medio inválido degrada a otro", () => {
    expect(parseEventConfig({ eventType: "estreno", medium: "manga" })).toEqual({
      eventType: "otro",
    });
  });
});

describe("validateEventConfig — lanza claves snake_case", () => {
  it("tipo fuera de la lista", () => {
    expect(() => validateEventConfig({ eventType: "concierto" })).toThrow(
      "event_type_invalid",
    );
  });

  it("estreno sin medio", () => {
    expect(() => validateEventConfig({ eventType: "estreno" })).toThrow("medium_required");
  });

  it("estreno con medio vacío cuenta como sin medio", () => {
    expect(() => validateEventConfig({ eventType: "estreno", medium: "" })).toThrow(
      "medium_required",
    );
  });

  it("estreno con medio inválido", () => {
    expect(() => validateEventConfig({ eventType: "estreno", medium: "manga" })).toThrow(
      "medium_invalid",
    );
  });

  it("estreno bien formado", () => {
    expect(validateEventConfig({ eventType: "estreno", medium: "book" })).toEqual({
      eventType: "estreno",
      medium: "book",
    });
  });

  it("medio sobrante en un NO-estreno se descarta en silencio", () => {
    // Es lo que pasa al cambiar el select de tipo con un medio ya elegido: no
    // es un error del usuario, así que no puede bloquear el envío.
    expect(validateEventConfig({ eventType: "quedada", medium: "movie" })).toEqual({
      eventType: "quedada",
    });
  });

  it("otro es el valor por defecto y es válido", () => {
    expect(validateEventConfig({ eventType: "otro" })).toEqual({ eventType: "otro" });
  });
});

describe("las listas son la fuente de los selects", () => {
  it("tres tipos, en el orden en que se ofrecen", () => {
    expect(CLUB_EVENT_TYPES).toEqual(["estreno", "quedada", "otro"]);
  });
  it("tres medios, en el orden de la leyenda", () => {
    expect(CLUB_EVENT_MEDIA).toEqual(["book", "movie", "series"]);
  });
});
