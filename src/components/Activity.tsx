// Assistant journal and activity dashboard over 90 days (key figures, heatmaps, active projects, recent commits).
import type { ActivityData, ActivityDay, JournalEntry } from "../../shared/types.ts";
import { dayOfMonth, parseDate, plural, shortWeekday } from "../utils.ts";

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

const NOTES_COLOR = "var(--peach)";
const COMMITS_COLOR = "#60A5FA";

type Field = "notes" | "commits";
const SHORT_MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
/** "2026-11-18" or an ISO date-time → "18 nov." */
const shortDate = (isoDate: string) => {
  const date = parseDate(isoDate.slice(0, 10));
  return `${date.getDate()} ${SHORT_MONTHS[date.getMonth()]}`;
};
/** Key figures of the period. A streak still counts if today has no activity yet. */
export function activityFigures(days: ActivityDay[], fields: Field[]) {
  const amount = (d: ActivityDay) => fields.reduce((sum, f) => sum + d[f], 0);
  const activeDays = days.filter((d) => amount(d) > 0).length;
  let end = days.length - 1;
  if (end >= 0 && amount(days[end]) === 0) end--;
  let streak = 0;
  while (end - streak >= 0 && amount(days[end - streak]) > 0) streak++;
  const busiest = days.reduce((best, d) => (amount(d) > amount(best) ? d : best), days[0]);
  return { activeDays, streak, busiest: amount(busiest) > 0 ? busiest : null };
}

/** 90-day heatmap: one column per week (Monday on top), cells stretched to the available width. */
function Heatmap({ days, field, color, title }: { days: ActivityDay[]; field: Field; color: string; title: string }) {
  const max = Math.max(1, ...days.map((d) => d[field]));
  const offset = (parseDate(days[0].date).getDay() + 6) % 7;
  const cells = [...Array(offset).fill(null), ...days];
  return (
    <div className="heatmap">
      <h3>{title}</h3>
      <div className="heatmap-grid">
        {cells.map((d, i) =>
          d ? (
            <i
              key={d.date}
              title={`${shortDate(d.date)} : ${d[field]}`}
              style={{ background: d[field] ? color : undefined, opacity: d[field] ? 0.3 + 0.7 * (d[field] / max) : undefined }}
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
  const fields: Field[] = commitsOnly ? ["commits"] : ["notes", "commits"];
  const total = (field: Field) => data.days.reduce((sum, d) => sum + d[field], 0);
  const { activeDays, streak, busiest } = activityFigures(data.days, fields);
  const maxCommits = Math.max(1, ...data.projects.map((p) => p.commits));
  return (
    <section className="panel activity">
      <h2>
        {commitsOnly ? "Activité git" : "Activité"} <span className="muted">90 derniers jours</span>
      </h2>

      <div className="activity-tiles">
        {!commitsOnly && (
          <div className="activity-tile">
            <span>Notes modifiées</span>
            <b style={{ color: NOTES_COLOR }}>{total("notes")}</b>
            <small>en 90 jours</small>
          </div>
        )}
        <div className="activity-tile">
          <span>Commits</span>
          <b style={{ color: COMMITS_COLOR }}>{total("commits")}</b>
          <small>tous les dépôts</small>
        </div>
        <div className="activity-tile">
          <span>Jours actifs</span>
          <b>{activeDays}</b>
          <small>sur {data.days.length}</small>
        </div>
        <div className="activity-tile">
          <span>Série en cours</span>
          <b style={{ color: "var(--green)" }}>{streak} j</b>
          <small>jours d'affilée</small>
        </div>
        <div className="activity-tile">
          <span>Jour le plus actif</span>
          <b>{busiest ? shortDate(busiest.date) : "–"}</b>
          <small>{busiest ? fields.map((f) => `${busiest[f]} ${f === "notes" ? "notes" : "commits"}`).join(" · ") : "rien encore"}</small>
        </div>
      </div>

      <div className={`activity-heatmaps${commitsOnly ? " single" : ""}`}>
        {!commitsOnly && <Heatmap days={data.days} field="notes" color={NOTES_COLOR} title="Notes modifiées" />}
        <Heatmap days={data.days} field="commits" color={COMMITS_COLOR} title="Commits" />
      </div>

      <div className="activity-lists">
        <div>
          <h3>Projets les plus actifs</h3>
          {data.projects.length === 0 && <p className="muted">Aucun commit ces 90 derniers jours.</p>}
          <div className="activity-bars">
            {data.projects.map((p) => (
              <div key={p.name} className="activity-bar">
                {p.link ? <a href={p.link}>{p.name}</a> : <span>{p.name}</span>}
                <div className="track">
                  <div style={{ width: `${(p.commits / maxCommits) * 100}%`, background: p.color }} />
                </div>
                <b className="mono">{p.commits}</b>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h3>Derniers commits</h3>
          <ul className="activity-feed">
            {data.commits.map((c) => (
              <li key={c.at + c.message}>
                <span className="mono muted">{shortDate(c.at)}</span>
                <span className="dot" style={{ background: c.color }} />
                <span className="what">
                  {c.message}
                  <small>{c.project}</small>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <p className="muted small">
        Grilles : une colonne par semaine (lundi en haut), plus la case est claire, plus il y a eu d'activité. Survole une case pour le
        détail. Derniers commits : {plural(data.commits.length, "commit")}, 3 au plus par projet, sans les fusions de PR.
      </p>
    </section>
  );
}
