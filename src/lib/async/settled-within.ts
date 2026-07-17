// ¿Terminó esta promesa dentro del presupuesto? true = sí, false = se agotó el
// tiempo. Nunca lanza, y sobre todo NUNCA cancela la promesa: el trabajo sigue
// vivo y es el llamador quien decide qué hacer con él (p. ej. cedérselo a
// after() para que termine tras la respuesta).
export function settledWithin(promise: Promise<unknown>, ms: number): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), ms);
    promise
      .then(
        () => {},
        () => {},
      )
      .finally(() => {
        clearTimeout(timer);
        resolve(true);
      });
  });
}
