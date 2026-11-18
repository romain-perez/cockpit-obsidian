// Routing through the address: #<space>/<view> (e.g. #school/stats).
export type Space = "today" | "school" | "projects" | "personal";

export const VIEWS: Record<Space, string[]> = {
  today: ["home", "calendar", "tasks", "journal", "activity"],
  school: ["home", "week", "tasks", "modules", "stats", "refcards", "drive"],
  projects: ["home", "list", "others", "activity"],
  personal: ["folders", "recent"],
};

export interface Route {
  space: Space;
  view: string;
}

export function readRoute(): Route {
  const [first, second] = location.hash.replace(/^#/, "").split("/");
  if (first in VIEWS) {
    const space = first as Space;
    return { space, view: VIEWS[space].includes(second) ? second : VIEWS[space][0] };
  }
  return { space: "today", view: "home" };
}

export function writeRoute({ space, view }: Route): void {
  const hash = space === "today" && view === "home" ? "" : `#${space}${view === VIEWS[space][0] ? "" : `/${view}`}`;
  history.replaceState(null, "", location.pathname + location.search + hash);
}
