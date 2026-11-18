// Data contract between the server and the browser.
// Field names are in English; the values meant for the user (titles, labels, details) are in French.

// ---------------------------------------------------------------- configuration

/** Configuration exposed to the browser (no secrets, no absolute paths). */
export interface PublicConfig {
  vaultName: string;
  language: string;
  agendaFile: string;
  gradesFile: string;
  projectsFolder: string;
  drive: { enabled: boolean; remoteLabel: string; commandName: string; webUrl: string | null };
  google: { enabled: boolean; personalCalendar: string; coursesCalendar: string };
}

// ---------------------------------------------------------------- school

/** A block of consecutive periods of the same course. */
export interface Course {
  code: string; // "M165", "MATH"
  label: string; // "M165", "Maths"
  start: string; // "07:55"
  end: string; // "12:00"
  room: string; // "F119 Labo ICT"
  teacher: string; // "" if unknown
  color: string;
  link: string | null; // obsidian:// link to the module note
}

export interface SchoolDay {
  date: string; // "2026-11-17"
  courses: Course[];
  exams: string[]; // ["Test 3 · M295"]
}

export interface Sequence {
  number: number;
  title: string;
  examDone: boolean; // front matter « examen passé: true »
  hasSource: boolean; // a « Source : [[…pdf]] » line exists
  link: string;
}

export interface ModuleExam {
  name: string; // "Test 3"
  date: string | null;
  done: boolean; // ticked in the module note
}

export interface SchoolModule {
  code: string;
  title: string;
  year: string; // "2ème année"
  finished: boolean;
  active: boolean; // has courses around today
  category: string;
  color: string;
  sequences: Sequence[];
  exams: ModuleExam[];
  nextCourse: { date: string; start: string; room: string } | null;
  link: string;
  refcard: string | null;
}

export type Severity = "urgent" | "warning" | "info";

export interface Task {
  id: string;
  title: string;
  detail: string;
  when: string; // "ven. 20", "en retard"…
  severity: Severity;
  color: string;
  link?: string;
}

export interface DriveFiles {
  added: string[];
  modified: string[];
  deleted: string[];
}

export interface DriveStatus {
  state: "upToDate" | "pending" | "checking" | "unknown";
  detail: string; // "à jour", "3 nouveaux, 1 modifié"
  checkedAt: string | null;
  running: boolean;
  files: DriveFiles;
  output: string; // raw output of the last check
}

export interface DriveUpload {
  running: boolean;
  lines: string[];
  exitCode: number | null;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface SubjectGrade {
  subject: string; // "M346", "Maths"
  code: string | null;
  average: number;
  grades: number[]; // detailed grades if known (weights unfolded)
  final: boolean;
  color: string;
  link: string | null;
}

export interface Semester {
  name: string;
  average: number;
  inProgress: boolean;
  subjects: SubjectGrade[];
}

export type CfcDomainKey = "practicalWork" | "generalEducation" | "itSkills" | "extendedBasics";

/** One qualification area of the final CFC grade. */
export interface CfcDomain {
  key: CfcDomainKey;
  label: string; // "Travail pratique (TPI)"
  writtenWeight: number; // weight in the ordinance, in %
  weight: number; // real share of the final grade, in % (exempted areas removed)
  grade: number | null; // null: not graded yet (or exempted)
  status: "known" | "pending" | "exempt";
  eliminatory: boolean; // must be at least 4
  detail: string; // "modules 5 (14 modules), CIE 5.5 (4 modules)"
}

/** Grade needed on the domains not graded yet to finish with a target final grade. */
export interface CfcRequirement {
  target: number;
  grade: number | null; // null: impossible (more than 6 needed)
  alreadySure: boolean; // reached even with the minimum grade
}

export interface CfcGrade {
  provisional: number | null; // weighted mean of the graded domains, rounded to a tenth
  domains: CfcDomain[];
  remaining: string; // "TPI" or "TPI et culture générale"
  required: CfcRequirement[];
  warnings: string[];
  assumptions: string[];
}

export interface SchoolData {
  generatedAt: string;
  today: string;
  week: SchoolDay[];
  modules: SchoolModule[];
  tasks: Task[];
  drive: DriveStatus;
  semesters: Semester[];
  cfc: CfcGrade | null;
}

// ---------------------------------------------------------------- projects

export interface GitStatus {
  branch: string;
  lastCommit: { date: string; message: string } | null;
  commitsLast30Days: number;
  uncommitted: number;
  unpushed: number | null; // null: no upstream branch
  remote: string | null;
  commitsPerDay: Record<string, number>;
  recentCommits: { at: string; message: string }[]; // last commits of the 90 days, without merges (at = ISO date-time)
}

export interface CodeFolder {
  path: string; // "~/github/portfolio"
  name: string;
  git: GitStatus | null;
  modifiedAt: string;
  group: string | null; // folders without a project sheet: group of their code root ("École", "Privé"…)
}

export interface CodeFolderGroup {
  name: string;
  folders: CodeFolder[];
}

export interface Project {
  name: string;
  sheet: string; // obsidian:// link to the project sheet
  status: string;
  nextStep: string;
  folders: CodeFolder[];
  repository: string | null;
  knowledgeBase: string | null;
  archived: boolean;
  color: string;
  updated: string;
}

export interface ProjectsData {
  projects: Project[];
  otherFolders: CodeFolder[];
  otherFolderGroups: CodeFolderGroup[]; // same folders, by code root, in the order of the configuration
}

// ---------------------------------------------------------------- vault, personal, journal, search

export interface NoteSummary {
  title: string;
  path: string;
  link: string;
  modifiedAt: string;
}

export interface PersonalFolder {
  name: string;
  noteCount: number;
  recent: NoteSummary[];
  link: string | null;
}

export interface PersonalData {
  folders: PersonalFolder[];
  recent: NoteSummary[];
}

export interface JournalEntry {
  date: string;
  title: string;
  request: string;
  nextStep: string;
  link: string;
}

export interface ActivityDay {
  date: string;
  notes: number;
  commits: number;
}

/** Commits of one project (or code folder without a sheet) over the 90 days. */
export interface ProjectActivity {
  name: string;
  color: string;
  commits: number;
  link: string | null; // project sheet
}

export interface CommitEntry {
  at: string; // ISO date-time
  project: string;
  color: string;
  message: string;
}

export interface ActivityData {
  journal: JournalEntry[];
  days: ActivityDay[];
  projects: ProjectActivity[]; // most active first, only those with commits
  commits: CommitEntry[]; // most recent first
}

export type VaultArea = "school" | "assistant" | "personal" | "other";

export interface SearchResult {
  title: string;
  path: string;
  area: VaultArea;
  link: string;
  excerpt: { before: string; match: string; after: string } | null;
}

// ---------------------------------------------------------------- agenda and calendar

export type AgendaEventType = "appointment" | "exam";

export interface AgendaEvent {
  id: string; // stable hash of the row
  date: string;
  start: string; // "" = whole day
  end: string;
  type: AgendaEventType;
  title: string;
  place: string;
  module: string; // "M295" for an exam (optional)
  note: string;
  color: string;
}

export interface CalendarExam {
  title: string;
  code: string | null;
  start: string;
  color: string;
  link: string | null;
  agendaId: string | null; // set when the exam comes from the agenda (can be edited or removed from the Cockpit)
  event: AgendaEvent | null; // the agenda row itself, for the edit form
}

export interface CalendarDay {
  date: string;
  courses: Course[];
  exams: CalendarExam[];
  events: AgendaEvent[];
}

export interface CalendarData {
  days: CalendarDay[];
  modules: { code: string; title: string }[];
  agendaLink: string;
}

export interface TodayData {
  school: SchoolData;
  projects: Project[];
  tasks: Task[];
  journal: JournalEntry[];
}

// ---------------------------------------------------------------- Google

export interface GoogleStatus {
  enabled: boolean;
  hasClient: boolean;
  connected: boolean;
  running: boolean;
  lastSync: string | null;
  summary: string;
  error: string | null;
}

export interface ScheduleSource {
  file: string | null;
  online: boolean;
  updatedAt: string | null;
  error: string | null;
}
