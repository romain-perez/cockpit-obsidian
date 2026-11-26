// Calendar: month grid, day detail, adding and editing appointments and exams (written to the agenda note).
import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import type { AgendaEvent, AgendaEventType, CalendarData, CalendarDay } from "../../shared/types.ts";
import { forcedDate, post } from "../api.ts";
import { useConfig } from "../config.tsx";
import { addDaysIso, MONTHS, parseDate, periodLabel, toIsoDate, weekdayName } from "../utils.ts";
import { GooglePanel } from "./Google.tsx";
import { Icon } from "./Icon.tsx";

const WEEKDAY_HEADERS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const GRID_DAYS = 42; // always 6 weeks
const VISIBLE_ITEMS = 3;

const todayDate = () => forcedDate ?? toIsoDate(new Date());

/** First Monday shown for a month. */
function gridStart(year: number, month: number): Date {
  const first = new Date(year, month, 1);
  return new Date(year, month, 1 - ((first.getDay() + 6) % 7));
}

interface EventForm {
  type: AgendaEventType;
  title: string;
  date: string;
  start: string;
  end: string;
  endDate: string; // "" = one day
  place: string;
  module: string;
  note: string;
}
const emptyForm = (date: string): EventForm => ({
  type: "appointment",
  title: "",
  date,
  start: "",
  end: "",
  endDate: "",
  place: "",
  module: "",
  note: "",
});
const colorVariable = (color: string) => ({ "--c": color }) as CSSProperties;

export function CalendarView({ onChange }: { onChange?: () => void }) {
  const { agendaFile, google } = useConfig();
  const today = todayDate();
  const [cursor, setCursor] = useState(() => {
    const d = parseDate(today);
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [selected, setSelected] = useState(today);
  const [data, setData] = useState<CalendarData | null>(null);
  const [form, setForm] = useState<EventForm>(emptyForm(today));
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null); // null: new event
  const multiDay = form.type === "appointment" && form.endDate !== "";

  const start = gridStart(cursor.year, cursor.month);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + GRID_DAYS - 1);
  const range = `from=${toIsoDate(start)}&to=${toIsoDate(end)}`;

  const load = async () => {
    const response = await fetch(`/api/calendar?${range}`);
    if (response.ok) setData(await response.json());
  };
  useEffect(() => {
    load();
  }, [range]); // eslint-disable-line react-hooks/exhaustive-deps

  const byDate = useMemo(() => new Map((data?.days ?? []).map((d) => [d.date, d])), [data]);
  const selectedDay: CalendarDay | undefined = byDate.get(selected);

  const changeMonth = (step: number) =>
    setCursor(({ year, month }) => {
      const d = new Date(year, month + step, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  const goToToday = () => {
    const d = parseDate(today);
    setCursor({ year: d.getFullYear(), month: d.getMonth() });
    setSelected(today);
  };
  const select = (date: string) => {
    setSelected(date);
    setForm((f) => ({ ...f, date }));
    setMessage(null);
  };
  const startAdding = () => {
    setEditingId(null);
    setForm(emptyForm(selected));
    setAdding(true);
    setMessage(null);
  };
  const startEditing = (event: AgendaEvent) => {
    const { date, start, end, endDate, type, title, place, module, note } = event;
    setEditingId(event.id);
    setForm({ date, start, end, endDate, type, title, place, module, note });
    setAdding(true);
    setMessage(null);
  };
  const stopEditing = () => {
    setAdding(false);
    setEditingId(null);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const sent = { ...form, endDate: form.type === "exam" ? "" : form.endDate }; // an exam takes one day
    const response = editingId ? await post("/api/agenda/update", { id: editingId, ...sent }) : await post("/api/agenda", sent);
    if (response.ok) {
      setMessage({ ok: true, text: editingId ? "Modifié dans Obsidian (note Agenda)." : "Ajouté dans Obsidian (note Agenda)." });
      setForm(emptyForm(form.date));
      stopEditing();
      setSelected(form.date);
      await load();
      onChange?.();
    } else setMessage({ ok: false, text: await response.text() });
  };
  const remove = async (id: string) => {
    const response = await post("/api/agenda/remove", { id });
    setMessage(response.ok ? { ok: true, text: "Retiré de l'agenda." } : { ok: false, text: "Suppression impossible." });
    await load();
    onChange?.();
  };

  const cells = Array.from({ length: GRID_DAYS }, (_, i) =>
    toIsoDate(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)),
  );
  const selectedDate = parseDate(selected);

  return (
    <section className="calendar">
      <div className="cal-month panel">
        <header className="cal-head">
          <h2>
            <b>{MONTHS[cursor.month]}</b> {cursor.year}
          </h2>
          <div className="cal-nav">
            <button className="button small" onClick={() => changeMonth(-1)} aria-label="Mois précédent">
              <Icon name="left" size={14} />
            </button>
            <button className="button small" onClick={goToToday}>
              Aujourd'hui
            </button>
            <button className="button small" onClick={() => changeMonth(1)} aria-label="Mois suivant">
              <Icon name="right" size={14} />
            </button>
            <button className="button small peach" onClick={startAdding}>
              + Ajouter
            </button>
          </div>
        </header>
        <div className="cal-grid" role="grid" aria-label={`${MONTHS[cursor.month]} ${cursor.year}`}>
          {WEEKDAY_HEADERS.map((d) => (
            <div key={d} className="cal-weekday">
              {d}
            </div>
          ))}
          {cells.map((date) => {
            const day = byDate.get(date);
            const d = parseDate(date);
            const items = [
              ...(day?.exams ?? []).map((x) => ({ key: `e-${x.title}`, kind: "exam", text: x.title, color: x.color, time: x.start })),
              ...(day?.events ?? []).map((x) => ({
                key: `r-${x.id}`,
                kind: "appointment",
                text: x.title,
                color: x.color,
                time: x.date === date ? x.start : "", // over several days: the time only on the first day
              })),
              ...(day?.courses ?? []).map((x) => ({
                key: `c-${x.code}-${x.start}`,
                kind: "course",
                text: x.label,
                color: x.color,
                time: x.start,
              })),
            ];
            return (
              <button
                key={date}
                role="gridcell"
                className={`cal-cell${d.getMonth() !== cursor.month ? " outside" : ""}${date === today ? " today" : ""}${date === selected ? " picked" : ""}${d.getDay() === 0 || d.getDay() === 6 ? " weekend" : ""}`}
                onClick={() => select(date)}
                onDoubleClick={() => {
                  select(date);
                  setEditingId(null);
                  setForm(emptyForm(date));
                  setAdding(true);
                }}
                aria-label={`${d.getDate()} ${MONTHS[d.getMonth()]}${items.length ? `, ${items.length} élément(s)` : ""}`}
              >
                <span className="number">{d.getDate()}</span>
                <span className="items">
                  {items.slice(0, VISIBLE_ITEMS).map((x) => (
                    <span key={x.key} className={`el ${x.kind}`} style={colorVariable(x.color)}>
                      {x.kind !== "course" && x.time && <i className="mono">{x.time}</i>}
                      {x.text}
                    </span>
                  ))}
                  {items.length > VISIBLE_ITEMS && <span className="plus">+{items.length - VISIBLE_ITEMS} de plus</span>}
                </span>
              </button>
            );
          })}
        </div>
        <p className="muted small cal-legend">
          <span>
            <i className="dot" style={{ background: "#f87171" }} /> examen
          </span>
          <span>
            <i className="dot" style={{ background: "#7DCFFF" }} /> rendez-vous
          </span>
          <span>
            <i className="line" /> cours (couleur de la catégorie)
          </span>
          <span>Double-clic sur un jour pour y ajouter quelque chose.</span>
        </p>
      </div>

      <aside className="cal-detail panel">
        <h3>
          {weekdayName(selectedDate)}{" "}
          <b>
            {selectedDate.getDate()} {MONTHS[selectedDate.getMonth()]}
          </b>
        </h3>
        {message && <p className={`message ${message.ok ? "ok" : "error"}`}>{message.text}</p>}

        {adding ? (
          <form className="cal-form" onSubmit={submit}>
            <div className="segment" role="radiogroup" aria-label="Type">
              {(["appointment", "exam"] as const).map((type) => (
                <button
                  type="button"
                  key={type}
                  className={form.type === type ? "on" : ""}
                  aria-pressed={form.type === type}
                  onClick={() => setForm({ ...form, type })}
                >
                  {type === "appointment" ? "Rendez-vous" : "Examen"}
                </button>
              ))}
            </div>
            <label>
              Titre
              <input
                id="agenda-title"
                required
                maxLength={80}
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder={form.type === "appointment" ? "Dentiste, réunion…" : "Test 2, examen final…"}
                autoFocus
              />
            </label>
            <div className="row">
              <label>
                Date
                <input
                  id="agenda-date"
                  type="date"
                  required
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                />
              </label>
              <label>
                {multiDay ? "Début (1er jour)" : "Début"}
                <input id="agenda-start" type="time" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} />
              </label>
              <label>
                {multiDay ? "Fin (dernier jour)" : "Fin"}
                <input id="agenda-end" type="time" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} />
              </label>
            </div>
            {form.type === "appointment" && (
              <div className="row multi-day">
                <label className="check">
                  <input
                    id="agenda-multi-day"
                    type="checkbox"
                    checked={multiDay}
                    onChange={(e) => setForm({ ...form, endDate: e.target.checked ? addDaysIso(form.date, 1) : "" })}
                  />
                  Plusieurs jours
                </label>
                {multiDay && (
                  <label>
                    Jusqu'au
                    <input
                      id="agenda-end-date"
                      type="date"
                      required
                      min={form.date}
                      value={form.endDate}
                      onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                    />
                  </label>
                )}
              </div>
            )}
            {form.type === "exam" && (
              <label>
                Module
                <select id="agenda-module" value={form.module} onChange={(e) => setForm({ ...form, module: e.target.value })}>
                  <option value="">(aucun : maths, anglais…)</option>
                  {data?.modules.map((m) => (
                    <option key={m.code} value={m.code}>
                      {m.code} · {m.title}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              Lieu
              <input
                id="agenda-place"
                maxLength={60}
                value={form.place}
                onChange={(e) => setForm({ ...form, place: e.target.value })}
                placeholder="Salle, ville…"
              />
            </label>
            <label>
              Remarque
              <input
                id="agenda-note"
                maxLength={140}
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                placeholder="Facultatif"
              />
            </label>
            <div className="row buttons">
              <button type="button" className="button" onClick={stopEditing}>
                Annuler
              </button>
              <button type="submit" className="button peach">
                {editingId ? "Enregistrer les changements" : "Ajouter dans Obsidian"}
              </button>
            </div>
            <p className="muted small">
              Enregistré dans la note <code>{agendaFile}</code>.{" "}
              {form.type === "exam" && "Un examen apparaît aussi dans la bande des jours et dans « À faire »."}
            </p>
          </form>
        ) : (
          <>
            {!selectedDay || (!selectedDay.courses.length && !selectedDay.exams.length && !selectedDay.events.length) ? (
              <p className="muted">Rien de prévu ce jour-là.</p>
            ) : (
              <ul className="cal-list">
                {selectedDay.exams.map((x) => (
                  <li key={x.title} className="exam" style={colorVariable(x.color)}>
                    <span className="mono time">{x.start || "journée"}</span>
                    <div>
                      {x.link ? (
                        <a href={x.link}>
                          <b>{x.title}</b>
                        </a>
                      ) : (
                        <b>{x.title}</b>
                      )}
                      <small>examen</small>
                    </div>
                    {x.event && <EventActions event={x.event} onEdit={startEditing} onRemove={remove} />}
                  </li>
                ))}
                {selectedDay.events.map((x) => (
                  <li key={x.id} style={colorVariable(x.color)}>
                    <span className="mono time">{eventTime(x, selected)}</span>
                    <div>
                      <b>{x.title}</b>
                      <small>
                        {[x.endDate && periodLabel(x.date, x.endDate), x.place, x.note].filter(Boolean).join(" · ") || "rendez-vous"}
                      </small>
                    </div>
                    <EventActions event={x} onEdit={startEditing} onRemove={remove} />
                  </li>
                ))}
                {selectedDay.courses.map((x) => (
                  <li key={x.code + x.start} style={colorVariable(x.color)}>
                    <span className="mono time">
                      {x.start}–{x.end}
                    </span>
                    <div>
                      {x.link ? (
                        <a href={x.link}>
                          <b>{x.label}</b>
                        </a>
                      ) : (
                        <b>{x.label}</b>
                      )}
                      <small>{[x.room, x.teacher].filter(Boolean).join(" · ")}</small>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <button className="button peach" onClick={startAdding}>
              + Ajouter ce jour-là
            </button>
            {data && (
              <a className="button small agenda-link" href={data.agendaLink}>
                <Icon name="obsidian" size={13} /> Ouvrir la note Agenda
              </a>
            )}
            {google.enabled && <GooglePanel />}
          </>
        )}
      </aside>
    </section>
  );
}

/** Time shown for an appointment on a day: over several days, the start on the first day and the end on the last. */
function eventTime(event: AgendaEvent, date: string): string {
  if (!event.start) return "journée";
  if (!event.endDate) return `${event.start}${event.end ? `–${event.end}` : ""}`;
  if (date === event.date) return `dès ${event.start}`;
  if (date === event.endDate) return `→ ${event.end}`;
  return "journée";
}

/** Edit and remove buttons of an agenda row. */
function EventActions({
  event,
  onEdit,
  onRemove,
}: {
  event: AgendaEvent;
  onEdit: (event: AgendaEvent) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <span className="cal-actions">
      <button className="button small" onClick={() => onEdit(event)}>
        Modifier
      </button>
      <button className="button small" onClick={() => onRemove(event.id)}>
        Retirer
      </button>
    </span>
  );
}
