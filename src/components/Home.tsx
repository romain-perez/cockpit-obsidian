// Shared components: waves, top bar, day strip, carousel.
import { useEffect, useRef, useState } from "react";
import type { DriveStatus, SchoolData } from "../../shared/types.ts";
import type { Card } from "../cards.ts";
import { openFolder } from "../api.ts";
import { useConfig } from "../config.tsx";
import { dayOfMonth, drawWaves, longDate, plural, seedOf, shortWeekday } from "../utils.ts";
import { Icon } from "./Icon.tsx";

/** Canvas of waves, redrawn when its size changes. */
export function Waves({ color, seed }: { color: string; seed: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const draw = () => drawWaves(canvas, color, seedOf(seed));
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [color, seed]);
  return <canvas ref={ref} className="waves" aria-hidden="true" />;
}

export function TopBar({ breadcrumb, onSearch }: { breadcrumb: string; onSearch: () => void }) {
  const { vaultName, language } = useConfig();
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 10_000);
    return () => clearInterval(timer);
  }, []);
  return (
    <header className="top-bar">
      <div className="breadcrumb">
        Cockpit <span>/ {breadcrumb}</span>
      </div>
      <div className="clock">
        <button className="button search-button" onClick={onSearch} title="Rechercher (/ ou Ctrl+K)">
          <Icon name="search" size={14} /> Rechercher <kbd>/</kbd>
        </button>
        <b>{now.toLocaleTimeString(language, { hour: "2-digit", minute: "2-digit" })}</b>
        <small>{longDate(now)}</small>
        <a className="button" href={`obsidian://open?vault=${encodeURIComponent(vaultName)}`}>
          <Icon name="obsidian" size={14} /> Ouvrir Obsidian
        </a>
      </div>
    </header>
  );
}

interface DayStripProps {
  data: SchoolData;
  selectedDay: string;
  onSelectDay: (date: string) => void;
  onOpenTasks: () => void;
  onOpenDrive: () => void;
}

export function DayStrip({ data, selectedDay, onSelectDay, onOpenTasks, onOpenDrive }: DayStripProps) {
  const { drive } = useConfig();
  const taskCount = data.tasks.length;
  return (
    <nav className="strip" aria-label="Semaine">
      <div className="days">
        {data.week.slice(0, 7).map((day) => {
          const free = day.courses.length === 0;
          return (
            <button
              key={day.date}
              className={`day${day.date === selectedDay ? " selected" : ""}${free ? " free" : ""}${day.date === data.today ? " today" : ""}`}
              onClick={() => onSelectDay(day.date)}
              aria-pressed={day.date === selectedDay}
            >
              {day.exams.length > 0 && <span className="exam-dot">Test</span>}
              <span>
                {shortWeekday(day.date)} {dayOfMonth(day.date)}
              </span>
              <span className="dots">
                {day.courses.map((c) => (
                  <i key={c.code + c.start} style={{ background: c.color }} />
                ))}
              </span>
              <small>{free ? "libre" : day.courses.map((c) => c.label).join(" · ")}</small>
            </button>
          );
        })}
      </div>
      <div className="bullets">
        <button className="bullet" onClick={onOpenTasks}>
          <Icon name="tasks" size={16} />
          <span>
            À faire<small>{taskCount ? plural(taskCount, "élément") : "rien"}</small>
          </span>
        </button>
        {drive.enabled && <DriveBullet status={data.drive} onClick={onOpenDrive} />}
      </div>
    </nav>
  );
}

const DRIVE_BULLET_CLASS: Record<DriveStatus["state"], string> = {
  upToDate: "ok",
  pending: "warning",
  checking: "neutral",
  unknown: "neutral",
};

function DriveBullet({ status, onClick }: { status: DriveStatus; onClick: () => void }) {
  return (
    <button className={`bullet ${DRIVE_BULLET_CLASS[status.state]}`} onClick={onClick}>
      <Icon name="drive" size={16} />
      <span>
        Drive<small>{status.detail}</small>
      </span>
    </button>
  );
}

export function Carousel({ cards }: { cards: Card[] }) {
  const [index, setIndex] = useState(0);
  const total = cards.length;
  // Back to the first card when the list changes (another day chosen)
  const signature = cards.map((c) => c.id).join("|");
  useEffect(() => setIndex(0), [signature]);

  const move = (step: number) => setIndex((i) => (i + step + total) % total);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, [contenteditable]") || document.querySelector(".search-backdrop")) return;
      if (e.key === "ArrowRight") move(1);
      if (e.key === "ArrowLeft") move(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Swipe with a finger or the mouse
  const swipeStart = useRef<number | null>(null);

  if (total === 0) return null;
  return (
    <section
      className="carousel"
      aria-roledescription="carrousel"
      onPointerDown={(e) => (swipeStart.current = e.clientX)}
      onPointerUp={(e) => {
        if (swipeStart.current !== null && Math.abs(e.clientX - swipeStart.current) > 60) move(e.clientX < swipeStart.current ? 1 : -1);
        swipeStart.current = null;
      }}
    >
      {cards.map((card, i) => {
        let position = i - index;
        if (position > total / 2) position -= total;
        if (position < -total / 2) position += total;
        const place =
          position === 0
            ? "center"
            : position === -1
              ? "left-side"
              : position === 1
                ? "right-side"
                : position < 0
                  ? "far-left"
                  : "far-right";
        return (
          <article
            key={card.id}
            className={`card ${place}${card.urgent ? " urgent" : ""}`}
            aria-hidden={position !== 0}
            onClick={() => position !== 0 && move(position)}
          >
            <Waves color={card.color} seed={card.seed} />
            <div className="veil" />
            <div className="label">
              <Icon name={card.urgent ? "alert" : "week"} size={15} /> {card.label}
            </div>
            <div className="content">
              <div className="kicker">
                {card.kicker.map((k) => (
                  <span key={k}>{k}</span>
                ))}
              </div>
              <h2 className={card.title.length > 42 ? "long" : ""}>{card.title}</h2>
              <div className="meta">
                {card.meta.map((m) => (
                  <div key={m.value + m.caption}>
                    <b>{m.value}</b>
                    {m.caption}
                  </div>
                ))}
              </div>
            </div>
            {position === 0 && (card.action || card.folder) && (
              <div className="actions">
                {card.folder && (
                  <button className="button glass" onClick={() => openFolder(card.folder!)}>
                    <Icon name="code" size={15} /> Ouvrir dans VS Code
                  </button>
                )}
                {card.action && (
                  <a className="button peach" href={card.action.link}>
                    {card.action.text} <Icon name="arrow" size={15} />
                  </a>
                )}
              </div>
            )}
          </article>
        );
      })}
      {total > 1 && (
        <>
          <button className="arrow left" onClick={() => move(-1)} aria-label="Carte précédente">
            <Icon name="left" size={18} />
          </button>
          <button className="arrow right" onClick={() => move(1)} aria-label="Carte suivante">
            <Icon name="right" size={18} />
          </button>
          <div className="pagination">
            {cards.map((c, i) => (
              <button key={c.id} className={i === index ? "on" : ""} onClick={() => setIndex(i)} aria-label={`Carte ${i + 1}`} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
