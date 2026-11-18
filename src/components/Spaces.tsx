// Space selector and configurable dock.
import type { ReactNode } from "react";
import type { Space } from "../routes.ts";
import { Icon, type IconName } from "./Icon.tsx";

export const SPACES: { id: Space; title: string; icon: IconName }[] = [
  { id: "today", title: "Aujourd'hui", icon: "sun" },
  { id: "school", title: "École", icon: "school" },
  { id: "projects", title: "Projets", icon: "projects" },
  { id: "personal", title: "Perso", icon: "personal" },
];

export function SpaceSelector({ active, onSelect }: { active: Space; onSelect: (space: Space) => void }) {
  return (
    <nav className="spaces" aria-label="Espaces">
      {SPACES.map((s) => (
        <button key={s.id} className={s.id === active ? "on" : ""} onClick={() => onSelect(s.id)} aria-pressed={s.id === active}>
          <Icon name={s.icon} size={15} /> {s.title}
        </button>
      ))}
    </nav>
  );
}

export interface DockItem {
  id: string;
  icon: IconName;
  title: string;
  badge?: number;
}

export function Dock({
  items,
  active,
  onOpen,
  extra,
}: {
  items: DockItem[];
  active: string;
  onOpen: (id: string) => void;
  extra?: ReactNode;
}) {
  return (
    <nav className="dock" aria-label="Vues">
      {items.map((item) => (
        <button
          key={item.id}
          className={item.id === active ? "on" : ""}
          onClick={() => onOpen(item.id)}
          title={item.title}
          aria-label={item.title}
        >
          <Icon name={item.icon} />
          {item.badge ? <span className="badge">{item.badge}</span> : null}
        </button>
      ))}
      {extra}
    </nav>
  );
}
