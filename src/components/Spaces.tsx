// Space selector and configurable dock.
import { useRef, type CSSProperties, type PointerEvent } from "react";
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

/** Extra button after the views (e.g. search): same look, its own action. */
export interface DockAction {
  id: string;
  icon: IconName;
  title: string;
  hint?: string; // keyboard shortcut shown in the bubble
  onClick: () => void;
}

/** Color role of each icon: the same icon has the same color in every space (tokens --dock-* in styles.css). */
const ICON_ROLE: Partial<Record<IconName, string>> = {
  home: "accent",
  week: "time",
  tasks: "action",
  modules: "reading",
  journal: "reading",
  clock: "reading",
  stats: "measure",
  activity: "measure",
  refcards: "cards",
  folder: "cards",
  drive: "share",
  projects: "share",
  search: "neutral",
};
const colorOf = (icon: IconName) => ({ "--c": `var(--dock-${ICON_ROLE[icon] ?? "accent"})` }) as CSSProperties;

const MAGNIFICATION = 0.4; // up to 1.4× under the pointer
const MAGNIFICATION_RANGE_PX = 110;

function DockButton({
  icon,
  title,
  hint,
  badge,
  on,
  onClick,
}: {
  icon: IconName;
  title: string;
  hint?: string;
  badge?: number;
  on?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`dock-item${on ? " on" : ""}`}
      style={colorOf(icon)}
      onClick={onClick}
      aria-label={title}
      aria-current={on ? "page" : undefined}
    >
      <Icon name={icon} />
      <span className="dock-label" aria-hidden="true">
        {title}
        {hint && <kbd>{hint}</kbd>}
      </span>
      {badge ? <span className="badge">{badge}</span> : null}
    </button>
  );
}

/** Dock: name bubble on hover, icons growing around the mouse pointer. */
export function Dock({
  items,
  active,
  onOpen,
  actions = [],
}: {
  items: DockItem[];
  active: string;
  onOpen: (id: string) => void;
  actions?: DockAction[];
}) {
  const dock = useRef<HTMLElement>(null);

  const magnify = (event: PointerEvent<HTMLElement>) => {
    if (event.pointerType !== "mouse" || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    for (const button of dock.current?.querySelectorAll<HTMLElement>(".dock-item") ?? []) {
      const box = button.getBoundingClientRect();
      const distance = Math.abs(event.clientX - (box.left + box.width / 2));
      button.style.setProperty("--s", (1 + MAGNIFICATION * Math.max(0, 1 - distance / MAGNIFICATION_RANGE_PX)).toFixed(3));
    }
  };
  const reset = () => dock.current?.querySelectorAll<HTMLElement>(".dock-item").forEach((button) => button.style.setProperty("--s", "1"));

  return (
    <nav ref={dock} className="dock" aria-label="Vues" onPointerMove={magnify} onPointerLeave={reset}>
      {items.map((item) => (
        <DockButton
          key={item.id}
          icon={item.icon}
          title={item.title}
          badge={item.badge}
          on={item.id === active}
          onClick={() => onOpen(item.id)}
        />
      ))}
      {actions.length > 0 && <span className="sep" />}
      {actions.map((action) => (
        <DockButton key={action.id} icon={action.icon} title={action.title} hint={action.hint} onClick={action.onClick} />
      ))}
    </nav>
  );
}
