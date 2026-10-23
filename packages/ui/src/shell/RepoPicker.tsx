import { useState } from "react";

export function RepoPicker({ recent, onOpen }: { recent: string[]; onOpen: (path: string) => void }) {
  const [path, setPath] = useState("");
  return (
    <div>
      <ul>
        {recent.map((r) => (
          <li key={r}>
            <button type="button" onClick={() => onOpen(r)}>{r}</button>
          </li>
        ))}
      </ul>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (path.trim()) onOpen(path.trim());
        }}
      >
        <input aria-label="repo path" value={path} onChange={(e) => setPath(e.target.value)} />
        <button type="submit">Open</button>
      </form>
    </div>
  );
}
