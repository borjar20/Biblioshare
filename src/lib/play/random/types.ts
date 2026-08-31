// Estado del acompañante Aleatorio (spec §3). Es deliberadamente pequeño: el
// feed de resultados NO vive aquí — se deriva del log de eventos.
export type BagItem = { name: string; count: number };

export type RandomState = {
  players: string[]; // lista compartida: primer jugador / orden / equipos
  bag: {
    items: BagItem[]; // count = RESTANTES (sin reemplazo descuenta)
    initial: BagItem[]; // foto para «Reiniciar bolsa»
    withReplacement: boolean;
  };
};
