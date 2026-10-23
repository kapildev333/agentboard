import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

type Env = Record<string, string | undefined>;

// Never throws: a dead daemon must not break the agent CLI that called the hook.
export async function relay(payload: string, env: Env, fetchFn: typeof fetch = fetch): Promise<void> {
  try {
    await fetchFn(`${env.AGENTBOARD_URL}/hook/${env.AGENTBOARD_CONSOLE_ID}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${env.AGENTBOARD_TOKEN ?? ""}` },
      body: payload,
      signal: AbortSignal.timeout(2000),
    });
  } catch {
    // swallowed on purpose
  }
}

// Codex passes the JSON as argv[2]; Gemini pipes it on stdin.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const payload = process.argv[2] ?? readFileSync(0, "utf8");
  await relay(payload, process.env);
  process.exit(0);
}
