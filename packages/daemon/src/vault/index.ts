import { HttpError } from "../files/http-error.js";
import type { RouteHandlers } from "../server/index.js";

export type VaultDeps = {
  /** The loaded board's repository for a request's `repo`; throws when the daemon has none. */
  repoOf: (repo: string) => Promise<string>;
};
type VaultRoutes = Required<Pick<RouteHandlers, "GET /api/vault/notes" | "GET /api/vault/note" | "PUT /api/vault/note" | "POST /api/vault/append">>;

// Stub until L63: every route answers 501.
export function createVaultHandlers(deps: VaultDeps): VaultRoutes {
  void deps; // the real handlers use it
  const todo = async (): Promise<never> => {
    throw new HttpError(501, "not built yet");
  };
  return { "GET /api/vault/notes": todo, "GET /api/vault/note": todo, "PUT /api/vault/note": todo, "POST /api/vault/append": todo };
}
