// El slot `modal` no pinta nada en las rutas que no intercepta. Sin este
// fichero, Next devuelve 404 al recargar cualquier página con el slot montado.
export default function Default() {
  return null;
}
