// Envuelve el reducer de useActionState para que un fallo de RED al invocar la
// server action NO reviente al error boundary más cercano (src/app/error.tsx),
// que desmontaría el <form> con todo lo tecleado (diagnóstico widget→sesión
// offline, P2: «conexión débil» al pulsar Guardar). El catch corre en CLIENTE
// —el wrapper es una función de cliente que llama a la action— así que el
// rechazo del fetch se convierte en estado renderizable ({ error: "network" })
// y la hoja sigue montada con los datos intactos.
//
// Notas:
// - Un redirect() del servidor no rechaza en cliente (lo resuelve el
//   transporte de Next), así que este catch no lo intercepta.
// - Un throw genuino del servidor también caería aquí; preferimos conservar el
//   form con un aviso impreciso a perder los datos con uno preciso.
// - El `as State` está acotado por el constraint: cualquier State cuyo `error`
//   admita "network" (AddSessionState lo declara) puede representar el fallo.
export function withNetworkCatch<State extends { error?: string }>(
  action: (prev: State, formData: FormData) => Promise<State>,
): (prev: State, formData: FormData) => Promise<State> {
  return async (prev, formData) => {
    try {
      return await action(prev, formData);
    } catch {
      return { error: "network" } as State;
    }
  };
}
