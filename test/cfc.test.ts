import assert from "node:assert/strict";
import { test } from "node:test";
import { computeCfcGrade, extendedBasicsGrades, moduleGrades, roundToHalf, roundToTenth } from "../server/school/cfc.ts";
import type { CfcSettings } from "../server/config.ts";
import type { Semester, SubjectGrade } from "../shared/types.ts";

const subject = (name: string, average: number, final = true): SubjectGrade => ({
  subject: name,
  code: name.match(/^M\d+/)?.[0] ?? null,
  average,
  grades: [],
  final,
  color: "#000000",
  link: null,
});
const semester = (name: string, subjects: SubjectGrade[]): Semester => ({
  name,
  average: 0,
  inProgress: subjects.some((s) => !s.final),
  subjects,
});

const settings = (overrides: Partial<CfcSettings> = {}): CfcSettings => ({
  enabled: true,
  weights: { practicalWork: 40, generalEducation: 20, itSkills: 30, extendedBasics: 10 },
  itSkillsShares: { schoolModules: 80, interCompanyCourses: 20 },
  interCompanyModules: ["M187"],
  generalEducationExempt: false,
  extendedBasicsSubjects: { Maths: 1, Anglais: 1 },
  extendedBasicsSemesters: 8,
  targets: [4, 5, 5.5],
  ...overrides,
});

test("rounding rules of the ordinance", () => {
  assert.equal(roundToHalf(4.74), 4.5);
  assert.equal(roundToHalf(4.75), 5);
  assert.equal(roundToHalf(5.24), 5);
  assert.equal(roundToTenth(5.075), 5.1); // floating point: 5.075 * 10 = 50.74999…
  assert.equal(roundToTenth(4.849), 4.8);
});

test("a module graded over two semesters counts once, with the mean of both", () => {
  const modules = moduleGrades([semester("S1", [subject("M293", 5.2)]), semester("S2", [subject("M293", 5.0, false)])]);
  assert.equal(modules.length, 1);
  assert.equal(modules[0].grade, 5.1);
  assert.equal(modules[0].inProgress, true);
});

test("maths + English: one grade per semester, missing subjects reported", () => {
  const { grades, incomplete } = extendedBasicsGrades(
    [
      semester("S1", [subject("Maths", 4), subject("Anglais", 6)]),
      semester("S2", [subject("maths", 4.5)]),
      semester("S3", [subject("M106", 5)]),
    ],
    { Maths: 1, Anglais: 1 },
  );
  assert.deepEqual(grades, [5, 4.5]);
  assert.deepEqual(incomplete, ["S2 (seulement maths)"]);
  assert.deepEqual(
    extendedBasicsGrades([semester("S1", [subject("Maths", 4), subject("Anglais", 6)])], { Maths: 120, Anglais: 200 }).grades,
    [5.25],
  );
});

test("IT skills: 80 % school modules + 20 % inter-company courses, each rounded to a half grade first", () => {
  const cfc = computeCfcGrade([semester("S1", [subject("M117", 5.1), subject("M162", 5.17), subject("M187", 5.6)])], settings())!;
  const it = cfc.domains.find((d) => d.key === "itSkills")!;
  assert.equal(it.grade, 5.1); // school 5.135 → 5, courses 5.6 → 5.5 ; 0.8 × 5 + 0.2 × 5.5 = 5.1
  assert.match(it.detail, /modules d'école 5 \(2 modules\) · cours interentreprises 5.5 \(1 module\)/);
});

test("without inter-company grades, IT skills use the school modules alone (and say so)", () => {
  const cfc = computeCfcGrade([semester("S1", [subject("M117", 4.8)])], settings())!;
  assert.equal(cfc.domains.find((d) => d.key === "itSkills")!.grade, 5);
  assert.ok(cfc.assumptions.some((a) => a.includes("modules d'école seuls")));
});

test("exempted general education is not counted: the other weights become 50 / 37.5 / 12.5", () => {
  const cfc = computeCfcGrade(
    [semester("S1", [subject("M117", 5), subject("M187", 5), subject("Maths", 5), subject("Anglais", 5)])],
    settings({ generalEducationExempt: true }),
  )!;
  assert.deepEqual(
    cfc.domains.map((d) => [d.key, d.weight]),
    [
      ["practicalWork", 50],
      ["generalEducation", 0],
      ["itSkills", 37.5],
      ["extendedBasics", 12.5],
    ],
  );
  assert.equal(cfc.provisional, 5);
  assert.equal(cfc.remaining, "TPI");
  // Confirmed by the school: 5 everywhere (without general education) gives a final grade of 5
  assert.equal(cfc.required.find((r) => r.target === 5)!.grade, 4.9); // 4.9 is enough: 4.95 is rounded up to 5
});

test("grade needed on the remaining areas: eliminatory minimum, impossible targets", () => {
  const strong = computeCfcGrade(
    [semester("S1", [subject("M117", 6), subject("Maths", 6), subject("Anglais", 6)])],
    settings({ generalEducationExempt: true }),
  )!;
  assert.deepEqual(strong.required[0], { target: 4, grade: 4, alreadySure: true }); // the TPI itself must reach 4
  const weak = computeCfcGrade(
    [semester("S1", [subject("M117", 3), subject("Maths", 3), subject("Anglais", 3)])],
    settings({ generalEducationExempt: true }),
  )!;
  assert.equal(weak.required.find((r) => r.target === 5.5)!.grade, null);
  assert.ok(weak.warnings.some((w) => w.includes("Compétences informatiques sous 4")));
  const both = computeCfcGrade([semester("S1", [subject("M117", 5), subject("Maths", 5), subject("Anglais", 5)])], settings())!;
  assert.equal(both.remaining, "TPI et culture générale");
  const three = computeCfcGrade([semester("S1", [subject("M117", 5)])], settings())!;
  assert.equal(three.remaining, "TPI, culture générale et maths + anglais");
});

test("no module and no maths/English grade: nothing to show", () => {
  assert.equal(computeCfcGrade([], settings()), null);
  assert.equal(computeCfcGrade([semester("S1", [subject("Sport", 5)])], settings()), null);
});
