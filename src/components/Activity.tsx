// Assistant journal and activity over 90 days (heatmap of notes / commits).
import type { ActivityData, JournalEntry } from "../../shared/types.ts";
import { dayOfMonth, parseDate, shortWeekday } from "../utils.ts";

export function JournalList({ entries }: { entries: JournalEntry[] }) {
  return (
    <ol className="journal">
      {entries.map((e, i) => (
        <li key={e.date + e.title + i}>
          <span className="mono date">
            {shortWeekday(e.date)} {dayOfMonth(e.date)}.{parseDate(e.date).getMonth() + 1}
          </span>
          <div>
            <a href={e.link}>
              <b>{e.title}</b>
            </a>
            {e.request && <small>{e.request}</small>}
            {e.nextStep && (
              <small className="step">
                <b>Prochaine étape :</b> {e.nextStep}
              </small>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function JournalView({ data }: { data: ActivityData }) {
  return (
    <section className="panel narrow">
      <h2>
        Journal <span className="muted">{data.journal.length} dernières entrées</span>
      </h2>
      <JournalList entries={data.journal} />
    </section>
  );
}

/** 90-day heatmap: one column per week, one cell per day. */
function Heatmap({ days, field, color, title }: { days: ActivityData["days"]; field: "notes" | "commits"; color: string; title: string }) {
  const max = Math.max(1, ...days.map((d) => d[field]));
  const total = days.reduce((sum, d) => sum + d[field], 0);
  // Align on Monday → Sunday weeks
  const offset = (parseDate(days[0].date).getDay() + 6) % 7;
  const cells = [...Array(offset).fill(null), ...days];
  return (
    <div className="heatmap">
      <h3>
        {title} <span className="muted mono">{total} en 90 jours</span>
      </h3>
      <div className="heatmap-grid">
        {cells.map((d, i) =>
          d ? (
            <i
              key={d.date}
              title={`${d.date} : ${d[field]}`}
              style={{ background: d[field] ? color : "rgba(255,255,255,.05)", opacity: d[field] ? 0.3 + 0.7 * (d[field] / max) : 1 }}
            />
          ) : (
            <i key={`empty-${i}`} className="empty" />
          ),
        )}
      </div>
    </div>
  );
}

export function ActivityView({ data, commitsOnly = false }: { data: ActivityData; commitsOnly?: boolean }) {
  return (
    <section className="panel">
      <h2>
        Activité <span className="muted">90 derniers jours</span>
      </h2>
      <div className="heatmaps">
        {!commitsOnly && <Heatmap days={data.days} field="notes" color="var(--peach)" title="Notes modifiées" />}
        <Heatmap days={data.days} field="commits" color="#60A5FA" title="Commits (tous les dépôts)" />
      </div>
      <p className="muted small">
        Une colonne par semaine (lundi en haut). Plus la case est claire, plus il y a eu d'activité ce jour-là. Survole une case pour le
        détail.
      </p>
    </section>
  );
}
