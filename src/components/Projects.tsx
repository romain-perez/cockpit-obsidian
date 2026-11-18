// "Projets" space: project grid and code folders without a sheet.
import type { CodeFolder, Project, ProjectsData } from "../../shared/types.ts";
import { openFolder } from "../api.ts";
import { useConfig } from "../config.tsx";
import { Waves } from "./Home.tsx";
import { Icon } from "./Icon.tsx";

function GitStatusLine({ folder }: { folder: CodeFolder }) {
  const git = folder.git;
  if (!git) return <span className="muted">pas de git · modifié le {folder.modifiedAt}</span>;
  return (
    <span className="git-status">
      <span className="mono">
        <Icon name="branch" size={12} /> {git.branch}
      </span>
      {git.lastCommit && <span title={git.lastCommit.message}>{git.lastCommit.date}</span>}
      {git.uncommitted > 0 && (
        <span className="pill peach">
          {git.uncommitted} pas commité{git.uncommitted > 1 ? "s" : ""}
        </span>
      )}
      {git.unpushed ? <span className="pill blue">{git.unpushed} à pousser</span> : null}
    </span>
  );
}

function ProjectCard({ project: p }: { project: Project }) {
  return (
    <article className={`project-card${p.archived ? " off" : ""}`}>
      <div className="head">
        <Waves color={p.color} seed={`projet-${p.name}`} />
        <span className="code">{p.name}</span>
        {p.status && <span className="category">{p.status}</span>}
      </div>
      <div className="body">
        {p.nextStep && (
          <p className="step">
            <b>Prochaine étape</b> {p.nextStep}
          </p>
        )}
        {p.folders.map((f) => (
          <div key={f.path} className="folder-row">
            <span className="mono path" title={f.path}>
              {f.name}
            </span>
            <GitStatusLine folder={f} />
            <button className="button small" onClick={() => openFolder(f.path)} title={`Ouvrir ${f.path} dans VS Code`}>
              <Icon name="code" size={13} />
            </button>
          </div>
        ))}
        {!p.folders.length && <p className="muted">Pas de dossier de code.</p>}
        <div className="links">
          <a className="button small" href={p.sheet}>
            <Icon name="obsidian" size={13} /> Fiche
          </a>
          {p.knowledgeBase && (
            <a className="button small" href={p.knowledgeBase}>
              <Icon name="journal" size={13} /> KB
            </a>
          )}
          {p.repository && (
            <a className="button small" href={p.repository} target="_blank" rel="noreferrer">
              <Icon name="external" size={13} /> GitHub
            </a>
          )}
        </div>
      </div>
    </article>
  );
}

export function ProjectsView({ data }: { data: ProjectsData }) {
  const { projectsFolder } = useConfig();
  const active = data.projects.filter((p) => !p.archived),
    archived = data.projects.filter((p) => p.archived);
  return (
    <section className="panel">
      <h2>
        Projets <span className="muted">{active.length} en cours</span>
      </h2>
      <div className="projects-grid">
        {active.map((p) => (
          <ProjectCard key={p.name} project={p} />
        ))}
      </div>
      {archived.length > 0 && (
        <>
          <h2 className="sub">Archivés</h2>
          <div className="projects-grid">
            {archived.map((p) => (
              <ProjectCard key={p.name} project={p} />
            ))}
          </div>
        </>
      )}
      <p className="muted small">
        Un projet = une fiche de <code>{projectsFolder}/</code> avec <code>espace: projets</code> (propriétés <code>dossier</code>,{" "}
        <code>prochaine-etape</code>, <code>kb</code>, <code>depot</code>).
      </p>
    </section>
  );
}

export function OtherFoldersView({ data }: { data: ProjectsData }) {
  return (
    <section className="panel narrow">
      <h2>
        Autres dossiers de code <span className="muted">sans fiche de projet</span>
      </h2>
      {data.otherFolderGroups.map((group) => (
        <div key={group.name} className="folder-group">
          <h3>
            {group.name} <span className="muted">{group.folders.length}</span>
          </h3>
          <ul className="task-list">
            {group.folders.map((f) => (
              <li key={f.path} className="task info">
                <span className="color-strip" style={{ background: f.git ? "var(--peach)" : "rgba(255,255,255,.15)" }} />
                <div>
                  <b>{f.name}</b>
                  <small className="mono">{f.path}</small>
                  <small>
                    <GitStatusLine folder={f} />
                  </small>
                </div>
                <button className="button small" onClick={() => openFolder(f.path)}>
                  <Icon name="code" size={13} /> VS Code
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
