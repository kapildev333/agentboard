import { useEffect, useState, type ComponentType } from "react";
import { CodeStudio } from "./code/CodeStudio";
import { DiagramStudio } from "./diagram/DiagramStudio";
import { DocumentStudio } from "./document/DocumentStudio";
import { VaultStudio } from "./vault/VaultStudio";
import "./studios.css";

export { StudioContext, type SpawnOptions, type Studio } from "./context";
export { headings, renderMarkdown } from "./markdown";

export const studios = { document: DocumentStudio, diagram: DiagramStudio, code: CodeStudio, vault: VaultStudio } satisfies Record<string, ComponentType>;
export type StudioId = keyof typeof studios;

const TABS: [StudioId | null, string][] = [[null, "Board"], ["document", "Document"], ["diagram", "Diagram"], ["code", "Code"], ["vault", "Vault"]];

// `#/code` or `#/code?path=src/a.ts`; anything else is the board.
const fromHash = (): StudioId | null => {
  const id = /^#\/(\w+)/.exec(location.hash)?.[1];
  return id && id in studios ? (id as StudioId) : null;
};

/** The active studio from location.hash, or null for the board. */
export function useStudio(): StudioId | null {
  const [id, setId] = useState(fromHash);
  useEffect(() => {
    const on = () => setId(fromHash());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return id;
}

export function StudioTabs({ active }: { active: StudioId | null }) {
  return (
    <nav aria-label="Studios" className="tabs studio-tabs">
      {TABS.map(([id, label]) => (
        <button key={label} type="button" className="tab" aria-current={id === active ? "page" : undefined} onClick={() => (location.hash = id ? `/${id}` : "")}>
          {label}
        </button>
      ))}
    </nav>
  );
}
