// Search in the whole vault (never excluded nor private folders): overlay driven by the keyboard.
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { SearchResult, VaultArea } from "../../shared/types.ts";
import { openNote } from "../api.ts";
import { Icon } from "./Icon.tsx";

const AREA_NAMES: Record<VaultArea, string> = { school: "École", assistant: "Assistant", personal: "Perso", other: "Vault" };

export function Search({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selected, setSelected] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => input.current?.focus(), []);
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      if (response.ok) {
        setResults(await response.json());
        setSelected(0);
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [query]);

  const open = (r: SearchResult) => {
    openNote(r.link);
    onClose();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") onClose();
    else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[selected]) open(results[selected]);
  };

  return (
    <div className="search-backdrop" onClick={onClose}>
      <div className="search" role="dialog" aria-label="Rechercher dans le vault" onClick={(e) => e.stopPropagation()}>
        <label className="field">
          <Icon name="search" size={18} />
          <input
            id="vault-search"
            ref={input}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKey}
            placeholder="Rechercher dans le vault (sans accents, plusieurs mots possibles)"
            autoComplete="off"
          />
          <kbd>Échap</kbd>
        </label>
        {query.trim().length >= 2 && results.length === 0 && <p className="muted empty">Aucun résultat pour « {query} ».</p>}
        <ul className="results">
          {results.map((r, i) => (
            <li key={r.path} className={i === selected ? "on" : ""} onMouseEnter={() => setSelected(i)} onClick={() => open(r)}>
              <div className="title">
                <b>{r.title}</b>
                <span className="pill">{AREA_NAMES[r.area]}</span>
              </div>
              <small className="mono path">{r.path.replace(/\.md$/, "")}</small>
              {r.excerpt && (
                <small className="excerpt">
                  {r.excerpt.before}
                  <mark>{r.excerpt.match}</mark>
                  {r.excerpt.after}
                </small>
              )}
            </li>
          ))}
        </ul>
        <p className="hint muted">↑ ↓ pour choisir · Entrée pour ouvrir dans Obsidian · Échap pour fermer</p>
      </div>
    </div>
  );
}
