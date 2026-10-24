import type { Exec } from "../git/index.js";
import type { RouteHandlers } from "../server/index.js";
import { HttpError } from "./http-error.js";

export type FileDeps = {
  /** The loaded board's repository for a request's `repo`; throws when the daemon has none. */
  repoOf: (repo: string) => Promise<string>;
  /** Runs git (or any command) in a directory and answers its stdout. */
  git: Exec;
};
type FileRoutes = Required<Pick<RouteHandlers, "GET /api/files" | "GET /api/files/read" | "PUT /api/files/write">>;

// Stub until L61: every route answers 501.
export function createFileHandlers(deps: FileDeps): FileRoutes {
  void deps; // the real handlers use it
  const todo = async (): Promise<never> => {
    throw new HttpError(501, "not built yet");
  };
  return { "GET /api/files": todo, "GET /api/files/read": todo, "PUT /api/files/write": todo };
}
