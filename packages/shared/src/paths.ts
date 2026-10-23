type Env = Record<string, string | undefined>;

// No node:os or node:path here, so the browser bundle can import the package. `||`: an empty AGENTBOARD_HOME means unset.
export const agentboardHome = (env: Env = process.env): string =>
  env.AGENTBOARD_HOME || `${env.HOME ?? env.USERPROFILE ?? ""}/.agentboard`;
export const daemonFilePath = (env: Env = process.env): string => `${agentboardHome(env)}/daemon.json`;
