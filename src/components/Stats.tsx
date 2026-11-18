// Stats view: exam grades per semester (grades note of the vault).
import { useState } from "react";
import type { CfcGrade, SchoolData, Semester } from "../../shared/types.ts";
import { useConfig } from "../config.tsx";
import { Icon } from "./Icon.tsx";

/** Color of a grade: green from 5, peach between 4 and 5, red below 4. */
const gradeColor = (n: number) => (n >= 5 ? "var(--green)" : n >= 4 ? "var(--peach)" : "var(--red)");
const format = (n: number) => n.toFixed(2).replace(/\.?0+$/, "");
/** "2ème année · 1er semestre" → "2A S1" */
const shortSemesterName = (name: string) =>
  name
    .replace("ère année · ", "A ")
    .replace("ème année · ", "A ")
    .replace(/(\d)(er|ème) semestre/, "S$1");

const semesterBlockId = (index: number) => `semester-${index}`;

export function StatsView({ data }: { data: SchoolData }) {
  const { gradesFile } = useConfig();
  const semesters = data.semesters;
  const [selected, setSelected] = useState(semesters.length - 1);
  if (!semesters.length) {
    return (
      <section className="panel narrow">
        <h2>Notes d'examen</h2>
        <p className="muted">
          Aucune note trouvée. Le Cockpit lit la note <code>{gradesFile}</code> du vault : une section <code>## semestre</code> par semestre
          et un tableau <code>| Branche | Moyenne | Notes | Statut |</code>.
        </p>
      </section>
    );
  }
  const semester = semesters[Math.min(selected, semesters.length - 1)];
  const overall = semesters.reduce((sum, s) => sum + s.average, 0) / semesters.length;
  const best = [...semester.subjects].sort((a, b) => b.average - a.average)[0];
  const weakest = [...semester.subjects].sort((a, b) => a.average - b.average)[0];

  // Subjects present in at least 2 semesters (Maths, English…)
  const tracked = [...new Set(semesters.flatMap((s) => s.subjects).map((s) => s.subject))]
    .map((subject) => ({ subject, points: semesters.map((s) => s.subjects.find((x) => x.subject === subject)?.average ?? null) }))
    .filter((x) => x.points.filter((p) => p !== null).length >= 2);

  return (
    <section className="panel stats">
      <h2>
        Notes d'examen{" "}
        <span className="muted">
          moyenne des {semesters.length} semestres : {format(overall)}
        </span>
      </h2>

      {data.cfc && <CfcCard cfc={data.cfc} />}

      <div className="semester-tiles">
        {semesters.map((s, i) => {
          const previous = semesters[i - 1];
          const delta = previous ? s.average - previous.average : null;
          return (
            <button
              key={s.name}
              className={`semester-tile${i === selected ? " picked" : ""}`}
              onClick={() => {
                setSelected(i);
                document.getElementById(semesterBlockId(i))?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              aria-pressed={i === selected}
            >
              <span className="name">{s.name}</span>
              <b style={{ color: gradeColor(s.average) }}>{format(s.average)}</b>
              <span className="sub">
                {delta !== null && (
                  <span className={delta >= 0 ? "up" : "down"}>
                    <Icon name={delta >= 0 ? "up" : "down"} size={13} /> {delta >= 0 ? "+" : ""}
                    {format(delta)}
                  </span>
                )}
                <span className={`status${s.inProgress ? " in-progress" : ""}`}>{s.inProgress ? "en cours" : "définitif"}</span>
                <span>{s.subjects.length} branches</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="stats-body">
        <div className="semester-stack">
          {/* Every semester with grades, most recent first (empty semesters never appear in the grades note) */}
          {semesters
            .map((s, i) => ({ s, i }))
            .reverse()
            .map(({ s, i }) => (
              <div key={s.name} id={semesterBlockId(i)} className={`block semester-block${i === selected ? " picked" : ""}`}>
                <div className="semester-head">
                  <h3>{s.name}</h3>
                  <span className="mono" style={{ color: gradeColor(s.average) }}>
                    {format(s.average)}
                  </span>
                  <span className={`status${s.inProgress ? " in-progress" : ""}`}>{s.inProgress ? "en cours" : "définitif"}</span>
                </div>
                <Bars semester={s} />
              </div>
            ))}
        </div>
        <div className="block column">
          <h3>Moyenne par semestre</h3>
          <Curve values={semesters.map((s) => s.average)} labels={semesters.map((s) => shortSemesterName(s.name))} />
          <h3 className="facts-title">{semester.name}</h3>
          <div className="facts">
            <div>
              <span>Meilleure</span>
              <b>{best.subject}</b>
              <em style={{ color: gradeColor(best.average) }}>{format(best.average)}</em>
            </div>
            <div>
              <span>À surveiller</span>
              <b>{weakest.subject}</b>
              <em style={{ color: gradeColor(weakest.average) }}>{format(weakest.average)}</em>
            </div>
            <div>
              <span>Branches à 5 ou plus</span>
              <b>
                {semester.subjects.filter((s) => s.average >= 5).length} / {semester.subjects.length}
              </b>
              <em />
            </div>
          </div>
          {tracked.length > 0 && (
            <>
              <h3>Au fil des semestres</h3>
              <div className="tracked-list">
                {tracked.map((x) => (
                  <div key={x.subject} className="tracked">
                    <b>{x.subject}</b>
                    <Sparkline points={x.points} />
                    <span className="mono">{x.points.map((p) => (p === null ? "–" : format(p))).join(" → ")}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
      <p className="muted small">
        Source : <code>{gradesFile}</code> (dossier privé, jamais partagé).
      </p>
    </section>
  );
}

/** Horizontal bars, scale from 3 to 6 with markers at 4 and 5. */
function Bars({ semester }: { semester: Semester }) {
  const min = 3,
    max = 6;
  const position = (n: number) => `${((Math.min(Math.max(n, min), max) - min) / (max - min)) * 100}%`;
  const sorted = [...semester.subjects].sort((a, b) => b.average - a.average);
  return (
    <div className="bars">
      {sorted.map((s) => (
        <div key={s.subject} className="bar">
          {s.link ? <a href={s.link}>{s.subject}</a> : <span>{s.subject}</span>}
          <div className="track">
            {[4, 5].map((r) => (
              <i key={r} className="marker" style={{ left: position(r) }} />
            ))}
            <div className="filled" style={{ width: position(s.average), background: s.color }} />
          </div>
          <b className="mono" style={{ color: gradeColor(s.average) }}>
            {format(s.average)}
          </b>
        </div>
      ))}
      <div className="bar scale">
        <span />
        <div className="track bare">
          {[3, 4, 5, 6].map((r) => (
            <small key={r} style={{ left: position(r) }}>
              {r}
            </small>
          ))}
        </div>
        <span />
      </div>
    </div>
  );
}

/** Curve of the semester averages (SVG). */
function Curve({ values, labels }: { values: number[]; labels: string[] }) {
  const width = 320,
    height = 150,
    marginX = 34,
    marginY = 22;
  const bottom = Math.min(4, Math.floor(Math.min(...values) * 2) / 2),
    top = 6;
  const x = (i: number) => (values.length === 1 ? width / 2 : marginX + (i * (width - 2 * marginX)) / (values.length - 1));
  const y = (v: number) => height - marginY - ((v - bottom) / (top - bottom)) * (height - 2 * marginY);
  const path = values.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join(" ");
  return (
    <svg className="curve" viewBox={`0 0 ${width} ${height + 16}`} role="img" aria-label={`Moyennes : ${values.map(format).join(", ")}`}>
      {[bottom, 5, top]
        .filter((v, i, all) => all.indexOf(v) === i)
        .map((v) => (
          <g key={v}>
            <line x1={marginX - 10} x2={width - marginX + 10} y1={y(v)} y2={y(v)} className="grid" />
            <text x={marginX - 14} y={y(v) + 4} textAnchor="end" className="axis">
              {v}
            </text>
          </g>
        ))}
      <path d={`${path} L${x(values.length - 1)},${height - marginY} L${x(0)},${height - marginY} Z`} className="area" />
      <path d={path} className="line" />
      {values.map((v, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(v)} r={i === values.length - 1 ? 5.5 : 4} fill={gradeColor(v)} />
          <text x={x(i)} y={y(v) - 11} textAnchor="middle" className="value">
            {format(v)}
          </text>
          <text x={x(i)} y={height + 10} textAnchor="middle" className="axis">
            {labels[i]}
          </text>
        </g>
      ))}
    </svg>
  );
}

/** Small curve of one subject (missing points skipped). */
function Sparkline({ points }: { points: (number | null)[] }) {
  const width = 90,
    height = 26,
    bottom = 3.5,
    top = 6;
  const coordinates = points
    .map((p, i) =>
      p === null
        ? null
        : ([6 + (i * (width - 12)) / Math.max(1, points.length - 1), height - 4 - ((p - bottom) / (top - bottom)) * (height - 8)] as const),
    )
    .filter((p): p is readonly [number, number] => p !== null);
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <path
        d={coordinates.map((p, i) => `${i ? "L" : "M"}${p[0]},${p[1]}`).join(" ")}
        fill="none"
        stroke="var(--muted)"
        strokeWidth="1.6"
      />
      {coordinates.map((p, i) => (
        <circle
          key={i}
          cx={p[0]}
          cy={p[1]}
          r={i === coordinates.length - 1 ? 3.2 : 2.2}
          fill={i === coordinates.length - 1 ? "var(--peach)" : "var(--muted)"}
        />
      ))}
    </svg>
  );
}

/** Provisional final CFC grade: graded areas, grade needed on the remaining ones, assumptions. */
function CfcCard({ cfc }: { cfc: CfcGrade }) {
  const counted = cfc.domains.filter((d) => d.status !== "exempt");
  return (
    <div className="cfc-card">
      <div className="cfc-main">
        <span className="name">Note CFC provisoire</span>
        <b style={{ color: cfc.provisional === null ? undefined : gradeColor(cfc.provisional) }}>
          {cfc.provisional === null ? "–" : format(cfc.provisional)}
        </b>
        <span className="sub">{cfc.remaining ? `sans ${cfc.remaining}, pas encore noté` : "toutes les notes sont connues"}</span>
      </div>

      <ul className="cfc-domains">
        {cfc.domains.map((d) => (
          <li key={d.key} className={d.status}>
            <span className="cfc-weight mono">{d.status === "exempt" ? "0 %" : `${format(d.weight)} %`}</span>
            <div>
              <b>
                {d.label}
                {d.eliminatory && <span className="pill">éliminatoire</span>}
              </b>
              <small>{d.detail}</small>
            </div>
            <span
              className={`cfc-grade mono${d.grade === null ? " none" : ""}`}
              style={{ color: d.grade === null ? undefined : gradeColor(d.grade) }}
            >
              {d.grade !== null ? format(d.grade) : d.status === "exempt" ? "dispensé" : "à venir"}
            </span>
          </li>
        ))}
      </ul>

      {cfc.required.length > 0 && (
        <div className="cfc-required">
          <span className="name">Note nécessaire {cfc.remaining === "TPI" ? "au TPI" : `(${cfc.remaining})`}</span>
          <div>
            {cfc.required.map((r) => (
              <span key={r.target} className={`cfc-target${r.grade === null ? " impossible" : ""}`}>
                <small>pour finir à {format(r.target)}</small>
                <b className="mono">{r.grade === null ? "impossible" : format(r.grade)}</b>
                {r.alreadySure && <small>minimum du TPI</small>}
              </span>
            ))}
          </div>
        </div>
      )}

      {cfc.warnings.map((w) => (
        <p key={w} className="message error">
          {w}
        </p>
      ))}
      <details className="cfc-assumptions">
        <summary>Comment c'est calculé</summary>
        <ul>
          <li>
            Note finale = moyenne pondérée de {counted.map((d) => `${d.label.toLowerCase()} (${d.writtenWeight})`).join(", ")}, arrondie au
            dixième ; comme à l'école, chaque note de module et chaque note semestrielle de maths + anglais est arrondie à la demi-note,
            ainsi que les moyennes des modules et des cours interentreprises.
          </li>
          {cfc.assumptions.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}
