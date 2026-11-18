// Cockpit: dashboard of the whole vault, in spaces Aujourd'hui · École · Projets · Perso.
import { useEffect, useMemo, useState } from "react";
import type { ActivityData, PersonalData, ProjectsData, PublicConfig, SchoolData, TodayData } from "../shared/types.ts";
import { openNote, useApi } from "./api.ts";
import { projectCard, schoolCards, todayCards } from "./cards.ts";
import { ConfigContext, useConfig } from "./config.tsx";
import { readRoute, writeRoute, type Route, type Space } from "./routes.ts";
import { ActivityView, JournalView } from "./components/Activity.tsx";
import { CalendarView } from "./components/Calendar.tsx";
import { DriveView } from "./components/Drive.tsx";
import { Carousel, DayStrip, TopBar } from "./components/Home.tsx";
import { PersonalFoldersView, RecentNotesView } from "./components/Personal.tsx";
import { OtherFoldersView, ProjectsView } from "./components/Projects.tsx";
import { Search } from "./components/Search.tsx";
import { Dock, SPACES, SpaceSelector, type DockItem } from "./components/Spaces.tsx";
import { StatsView } from "./components/Stats.tsx";
import { ModulesView, RefcardsView, TasksView, WeekView } from "./components/Views.tsx";

const VIEW_TITLES: Record<string, string> = {
  home: "Accueil",
  week: "Semaine",
  tasks: "À faire",
  modules: "Modules",
  stats: "Stats",
  refcards: "Refcards",
  drive: "Drive",
  journal: "Journal",
  activity: "Activité",
  calendar: "Calendrier",
  list: "Tous les projets",
  others: "Autres dossiers",
  folders: "Dossiers",
  recent: "Récentes",
};

function Loading({ error }: { error: string | null }) {
  return (
    <div className="loading">
      {error ? (
        <>
          <b>Le Cockpit n'arrive pas à lire ces données</b>
          <small>{error}</small>
        </>
      ) : (
        <small>Lecture du vault…</small>
      )}
    </div>
  );
}

/** Loads the public configuration once, then renders the Cockpit. */
export default function App() {
  const { data: config, error } = useApi<PublicConfig>("/api/config");
  if (!config)
    return (
      <div className="app">
        <Loading error={error} />
      </div>
    );
  return (
    <ConfigContext.Provider value={config}>
      <Cockpit />
    </ConfigContext.Provider>
  );
}

function Cockpit() {
  const { drive } = useConfig();
  const [route, setRoute] = useState<Route>(readRoute);
  const { space, view } = route;
  const go = (next: Route) => {
    setRoute(next);
    writeRoute(next);
  };
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const follow = () => setRoute(readRoute());
    addEventListener("hashchange", follow);
    return () => removeEventListener("hashchange", follow);
  }, []);

  // Shortcuts: "/" or Ctrl+K opens the search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea, [contenteditable]")) return;
      if (e.key === "/" || (e.key.toLowerCase() === "k" && (e.ctrlKey || e.metaKey))) {
        e.preventDefault();
        setSearching(true);
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);

  // Every obsidian:// link goes through the server (browsers often block these links)
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement | null)?.closest?.("a[href^='obsidian://']") as HTMLAnchorElement | null;
      if (!anchor || e.button !== 0 || e.ctrlKey || e.metaKey) return;
      e.preventDefault();
      openNote(anchor.getAttribute("href")!);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  const today = useApi<TodayData>("/api/today", space === "today");
  const school = useApi<SchoolData>("/api/school", space === "school");
  const projects = useApi<ProjectsData>("/api/projects", space === "projects");
  const personal = useApi<PersonalData>("/api/personal", space === "personal");
  const activity = useApi<ActivityData>("/api/activity", view === "journal" || view === "activity");

  // The school of the day is also used by "Aujourd'hui" (day strip + courses)
  const schoolData = space === "today" ? (today.data?.school ?? null) : school.data;
  const selectedDay = schoolData?.week.find((d) => d.date === selectedDate) ?? schoolData?.week[0];
  const cards = useMemo(() => {
    if (space === "today" && today.data && selectedDay) return todayCards(today.data, selectedDay);
    if (space === "school" && school.data && selectedDay) return schoolCards(school.data, selectedDay);
    if (space === "projects" && projects.data) return projects.data.projects.filter((p) => !p.archived).map((p) => projectCard(p));
    return [];
  }, [space, today.data, school.data, projects.data, selectedDay]);

  const taskCount = space === "today" ? today.data?.tasks.length : school.data?.tasks.length;
  const docks: Record<Space, DockItem[]> = {
    today: [
      { id: "home", icon: "home", title: "Accueil" },
      { id: "calendar", icon: "week", title: "Calendrier" },
      { id: "tasks", icon: "tasks", title: "À faire", badge: taskCount },
      { id: "journal", icon: "journal", title: "Journal" },
      { id: "activity", icon: "activity", title: "Activité" },
    ],
    school: [
      { id: "home", icon: "home", title: "Accueil" },
      { id: "week", icon: "week", title: "Semaine" },
      { id: "tasks", icon: "tasks", title: "À faire", badge: taskCount },
      { id: "modules", icon: "modules", title: "Modules" },
      { id: "stats", icon: "stats", title: "Stats" },
      { id: "refcards", icon: "refcards", title: "Refcards" },
      ...(drive.enabled ? [{ id: "drive", icon: "drive", title: "Drive" } as DockItem] : []),
    ],
    projects: [
      { id: "home", icon: "home", title: "Projets en cours" },
      { id: "list", icon: "projects", title: "Tous les projets" },
      { id: "others", icon: "folder", title: "Autres dossiers de code" },
      { id: "activity", icon: "activity", title: "Activité git" },
    ],
    personal: [
      { id: "folders", icon: "folder", title: "Dossiers" },
      { id: "recent", icon: "clock", title: "Récentes" },
    ],
  };

  const selectSpace = (next: Space) => go({ space: next, view: docks[next][0].id });
  const spaceTitle = SPACES.find((s) => s.id === space)!.title;
  const showStrip = schoolData && selectedDay && view === "home" && (space === "today" || space === "school");
  const current = { today, school, projects, personal }[space];

  const content = () => {
    if (!current.data) return <Loading error={current.error} />;
    if (view === "home")
      return cards.length ? (
        <Carousel cards={cards} />
      ) : (
        <div className="loading">
          <small>Rien à afficher ici pour l'instant.</small>
        </div>
      );
    if (space === "today" && view === "calendar") return <CalendarView onChange={today.reload} />;
    if (space === "today" && view === "tasks")
      return (
        <TasksView
          tasks={today.data!.tasks}
          hiddenTasks={today.data!.hiddenTasks}
          onChange={today.reload}
          emptyText="Rien à faire : ni test proche, ni projet en retard."
        />
      );
    if (view === "journal" || view === "activity") {
      if (!activity.data) return <Loading error={activity.error} />;
      return view === "journal" ? (
        <JournalView data={activity.data} />
      ) : (
        <ActivityView data={activity.data} commitsOnly={space === "projects"} />
      );
    }
    if (space === "school" && school.data) {
      const data = school.data;
      if (view === "week") return <WeekView data={data} />;
      if (view === "tasks")
        return (
          <TasksView
            tasks={data.tasks}
            hiddenTasks={data.hiddenTasks}
            onChange={school.reload}
            emptyText="Rien à faire pour l'instant. Les tests à venir, les PDF à rédiger et les modules sans séquence apparaissent ici."
          />
        );
      if (view === "modules") return <ModulesView data={data} />;
      if (view === "stats") return <StatsView data={data} />;
      if (view === "refcards") return <RefcardsView data={data} />;
      if (view === "drive") return <DriveView onUploaded={school.reload} />;
    }
    if (space === "projects" && projects.data)
      return view === "list" ? <ProjectsView data={projects.data} /> : <OtherFoldersView data={projects.data} />;
    if (space === "personal" && personal.data)
      return view === "recent" ? <RecentNotesView data={personal.data} /> : <PersonalFoldersView data={personal.data} />;
    return null;
  };

  return (
    <div className="app">
      <TopBar breadcrumb={`${spaceTitle} · ${VIEW_TITLES[view] ?? view}`} onSearch={() => setSearching(true)} />
      <SpaceSelector active={space} onSelect={selectSpace} />
      {showStrip && (
        <DayStrip
          data={schoolData!}
          selectedDay={selectedDay!.date}
          onSelectDay={setSelectedDate}
          onOpenTasks={() => go({ space, view: "tasks" })}
          onOpenDrive={() => go({ space: "school", view: "drive" })}
        />
      )}
      <main className="scene" key={`${space}/${view}`}>
        {content()}
      </main>
      <Dock
        items={docks[space]}
        active={view}
        onOpen={(id) => go({ space, view: id })}
        actions={[{ id: "search", icon: "search", title: "Rechercher", hint: "/", onClick: () => setSearching(true) }]}
      />
      {searching && <Search onClose={() => setSearching(false)} />}
    </div>
  );
}
