import type { DaemonInfo } from "@agentboard/shared";

/** Call the daemon with its token; throws the daemon's `error` text on a non-2xx answer. */
export async function api(info: DaemonInfo, method: string, path: string, body?: unknown): Promise<unknown> {
  const res = await fetch(`http://127.0.0.1:${info.port}${path}`, {
    method,
    headers: { "x-agentboard-token": info.token, "x-agentboard-client": "cli", "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(json.error ?? `daemon answered ${res.status}`);
  return json;
}
