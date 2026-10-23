/** Parse a reply as JSON, throwing the daemon's `error` text (or the status) on a non-2xx. */
export async function readJson(res: Response): Promise<unknown> {
  const body: unknown = await res.json().catch(() => undefined);
  if (!res.ok) throw new Error((body as { error?: string } | undefined)?.error ?? `HTTP ${res.status}`);
  return body;
}
