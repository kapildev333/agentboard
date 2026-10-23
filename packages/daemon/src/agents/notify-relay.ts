import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

type Env = Record<string, string | undefined>;

// Never throws: a dead daemon or bad input must not break the agent CLI that called the hook.
// `payload` undefined means read stdin (Gemini); Codex passes it as argv[2].
export async function relay(payload: string | undefined, env: Env, fetchFn: typeof fetch = fetch): Promise<void> {
  try {
    const p = JSON.parse(payload ?? readFileSync(0, "utf8")) as Record<string, unknown>;
    await fetchFn(`${env.AGENTBOARD_URL}/hook/${env.AGENTBOARD_CONSOLE_ID}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${env.AGENTBOARD_TOKEN ?? ""}` },
      body: JSON.stringify({ agent: env.AGENTBOARD_AGENT, event: p.type ?? p.hook_event_name, payload: p }),
      signal: AbortSignal.timeout(2000),
    });
  } catch {
    // swallowed on purpose
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await relay(process.argv[2], process.env);
  process.exit(0);
}
