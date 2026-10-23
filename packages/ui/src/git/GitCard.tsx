import { useEffect, useState } from "react";
import { GitStatusSchema } from "@agentboard/shared";

type Status = ReturnType<typeof GitStatusSchema.parse>;

export function GitCard({ fetch, path, intervalMs = 10_000 }: { fetch: typeof globalThis.fetch; path: string; intervalMs?: number }) {
  const [status, setStatus] = useState<Status>();
  useEffect(() => {
    const load = async () => {
      const res = await fetch(`/api/git/status?path=${encodeURIComponent(path)}`);
      setStatus(GitStatusSchema.parse(await res.json()));
    };
    void load();
    const t = setInterval(load, intervalMs);
    return () => clearInterval(t);
  }, [fetch, path, intervalMs]);
  if (!status) return null;
  return (
    <div>
      <b>{status.branch}</b> <span>ahead {status.ahead}</span> <span>behind {status.behind}</span>{" "}
      <span>dirty {status.dirty}</span> <span>{status.lastCommit?.subject}</span>
    </div>
  );
}
