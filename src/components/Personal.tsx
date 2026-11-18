// "Perso" space: folders of the personal area and recent notes.
import type { NoteSummary, PersonalData } from "../../shared/types.ts";
import { Waves } from "./Home.tsx";
import { Icon } from "./Icon.tsx";

const FOLDER_COLORS = ["#7DCFFF", "#FF79C6", "#A3E635", "#FBBF24", "#C084FC", "#5EEAD4"];

export function NoteList({ notes }: { notes: NoteSummary[] }) {
  return (
    <ul className="note-list">
      {notes.map((n) => (
        <li key={n.path}>
          <a href={n.link} title={n.path}>
            {n.title}
          </a>
          <span className="mono muted">{n.modifiedAt}</span>
        </li>
      ))}
    </ul>
  );
}

export function PersonalFoldersView({ data }: { data: PersonalData }) {
  return (
    <section className="panel">
      <h2>
        Perso <span className="muted">{data.folders.length} dossiers</span>
      </h2>
      <div className="projects-grid">
        {data.folders.map((f, i) => (
          <article key={f.name} className="project-card">
            <div className="head">
              <Waves color={FOLDER_COLORS[i % FOLDER_COLORS.length]} seed={`perso-${f.name}`} />
              <span className="code">{f.name}</span>
              <span className="category">{f.noteCount} notes</span>
            </div>
            <div className="body">
              <NoteList notes={f.recent} />
              {f.link && (
                <a className="button small" href={f.link}>
                  <Icon name="folder" size={13} /> Note principale
                </a>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export function RecentNotesView({ data }: { data: PersonalData }) {
  return (
    <section className="panel narrow">
      <h2>
        Récemment modifiées <span className="muted">tout le vault, hors dossiers exclus</span>
      </h2>
      <NoteList notes={data.recent} />
    </section>
  );
}
