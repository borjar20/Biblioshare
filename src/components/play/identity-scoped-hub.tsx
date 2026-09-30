import { PlayersManager } from "./players-manager";
import { SavedGames } from "./saved-games";

/** Reinicia los dos espejos locales cuando la sesión cambia de identidad. */
export function IdentityScopedHub({ identity }: { identity: string }) {
  return (
    <>
      <SavedGames key={`saved:${identity}`} identity={identity} />
      <PlayersManager key={`players:${identity}`} identity={identity} />
    </>
  );
}
