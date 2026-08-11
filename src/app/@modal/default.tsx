// El slot `modal` no pinta nada en las rutas que no intercepta. Sin este
// fichero, Next devuelve 404 al recargar cualquier página con el slot montado.
// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export default function Default() {
  return null;
}
