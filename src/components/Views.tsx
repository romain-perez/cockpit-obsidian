// Secondary views opened from the dock.
import type { SchoolData, SchoolModule, Task } from "../../shared/types.ts";
import { plural, relativeDayName } from "../utils.ts";
import { Waves } from "./Home.tsx";

export function WeekView({ data }: { data: SchoolData }) {
  return (
    <section className="panel">
      <h2>Les {data.week.length} prochains jours</h2>
      <div className="week-grid">
        {data.week.map((day) => (
          <div key={day.date} className={`day-cell${day.courses.length ? "" : " empty"}`}>
            <h3>
              {relativeDayName(data.today, day.date)}
              {day.exams.map((e) => (
                <span key={e} className="pill red">
                  {e}
                </span>
              ))}
            </h3>
            {day.courses.length === 0 && <p className="muted">Pas de cours</p>}
            {day.courses.map((c) => (
              <a key={c.code + c.start} className="course-block" style={{ borderColor: c.color }} href={c.link ?? undefined}>
                <span className="mono">
                  {c.start}–{c.end}
                </span>
                <b>{c.label}</b>
                <small>
                  {c.room}
                  {c.teacher ? ` · ${c.teacher}` : ""}
                </small>
              </a>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

export function TasksView({ tasks, emptyText }: { tasks: Task[]; emptyText?: string }) {
  return (
    <section className="panel narrow">
      <h2>
        À faire <span className="muted">{plural(tasks.length, "élément")}</span>
      </h2>
      {tasks.length === 0 && <p className="muted">{emptyText ?? "Rien à faire pour l'instant."}</p>}
      <ul className="task-list">
        {tasks.map((t) => (
          <li key={t.id} className={`task ${t.severity}`}>
            <span className="color-strip" style={{ background: t.color }} />
            <div>
              <b>{t.title}</b>
              <small>{t.detail}</small>
            </div>
            <span className="when mono">{t.when}</span>
            {t.link && (
              <a className="button small" href={t.link}>
                Ouvrir
              </a>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ModulesView({ data }: { data: SchoolData }) {
  const active = data.modules.filter((m) => m.active);
  const others = data.modules.filter((m) => !m.active && m.year === active[0]?.year);
  const card = (m: SchoolModule) => (
    <article key={m.code} className={`module-card${m.active ? "" : " off"}`}>
      <div className="head">
        <Waves color={m.color} seed={m.code} />
        <span className="code">{m.code}</span>
        <span className="category">{m.category}</span>
      </div>
      <div className="body">
        <a className="title" href={m.link}>
          {m.title}
        </a>
        <div className="sequences">
          {m.sequences.map((s) => (
            <a
              key={s.number}
              href={s.link}
              title={`Séquence ${s.number} · ${s.title}${s.examDone ? " (déjà évaluée)" : " (à réviser)"}`}
              style={{ background: s.examDone ? "rgba(255,255,255,.18)" : m.color }}
            />
          ))}
          <small>{m.sequences.length ? `${m.sequences.length} séq.` : "aucune séquence"}</small>
        </div>
        <div className="row">
          <span>Prochain cours</span>
          <b>
            {m.nextCourse ? `${relativeDayName(data.today, m.nextCourse.date)} ${m.nextCourse.start}` : m.finished ? "terminé" : "aucun"}
          </b>
        </div>
        {m.exams
          .filter((e) => !e.done && e.date && e.date >= data.today)
          .slice(0, 1)
          .map((e) => (
            <span key={e.name} className="pill red">
              {e.name}
              {e.date ? ` · ${relativeDayName(data.today, e.date).toLowerCase()}` : ""}
            </span>
          ))}
      </div>
    </article>
  );
  return (
    <section className="panel">
      <h2>Modules en cours</h2>
      <p className="legend">
        <span>
          <i style={{ background: "var(--peach)" }} /> séquence à réviser
        </span>
        <span>
          <i style={{ background: "rgba(255,255,255,.18)" }} /> séquence déjà évaluée (<code>examen passé</code> coché)
        </span>
        <span className="muted">Cartes grisées : modules terminés ou pas encore commencés.</span>
      </p>
      <div className="modules-grid">{active.map(card)}</div>
      {others.length > 0 && (
        <>
          <h2 className="sub">Même année</h2>
          <div className="modules-grid">{others.map(card)}</div>
        </>
      )}
    </section>
  );
}

export function RefcardsView({ data }: { data: SchoolData }) {
  const withRefcard = data.modules.filter((m) => m.refcard);
  const without = data.modules.filter((m) => !m.refcard && m.active);
  return (
    <section className="panel narrow">
      <h2>Refcards</h2>
      <ul className="task-list">
        {withRefcard.map((m) => (
          <li key={m.code} className="task info">
            <span className="color-strip" style={{ background: m.color }} />
            <div>
              <b>
                {m.code} · {m.title}
              </b>
              <small>{m.finished ? "module terminé" : "module en cours"}</small>
            </div>
            <a className="button small" href={m.refcard!}>
              Ouvrir
            </a>
          </li>
        ))}
      </ul>
      {without.length > 0 && (
        <p className="muted">
          Pas encore de refcard : {without.map((m) => m.code).join(", ")}. Une refcard est une note <code>refcard.md</code> dans le dossier
          du module.
        </p>
      )}
    </section>
  );
}
