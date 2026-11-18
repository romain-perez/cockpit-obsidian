import assert from "node:assert/strict";
import { test } from "node:test";
import { widgetFrom } from "../server/widget.ts";
import type { Course } from "../shared/types.ts";

const course = (code: string, start: string, end: string, room = "F119 Labo ICT"): Course => ({
  code,
  label: code,
  start,
  end,
  room,
  teacher: "Prof",
  color: "#c084fc",
  link: null,
});
// Wednesday 18: Maths then M295; Thursday 19: M347; Friday 20: M295 (+ exam)
const week: Record<string, Course[]> = {
  "2026-11-18": [course("Maths", "10:30", "12:00", "E302"), course("M295", "12:45", "16:50")],
  "2026-11-19": [course("M347", "07:55", "12:00", "E304 ICT")],
  "2026-11-20": [course("M295", "07:55", "12:00")],
};
const input = (clock: string, today = "2026-11-18") => ({
  today,
  clock,
  coursesOf: (date: string) => week[date] ?? [],
  exams: [{ title: "Test 3 · M295", date: "2026-11-20" }],
  tasks: 3,
  url: "http://localhost:4321",
});

test("during a course: progress, time left, then the following courses", () => {
  const w = widgetFrom(input("14:55"));
  assert.equal(w.now?.code, "M295");
  assert.equal(w.now?.roomShort, "F119");
  assert.equal(w.now?.remainingMinutes, 115);
  assert.ok(w.now!.progress > 0.5 && w.now!.progress < 0.55);
  assert.equal(w.next?.code, "M347");
  assert.equal(w.next?.day, "demain");
  assert.deepEqual(
    w.following.map((c) => c.code),
    ["M347", "M295"],
  );
});

test("between two courses and after the last one", () => {
  const between = widgetFrom(input("12:20"));
  assert.equal(between.now, null);
  assert.equal(between.next?.code, "M295");
  assert.equal(between.next?.day, "aujourd'hui");
  const evening = widgetFrom(input("18:00"));
  assert.equal(evening.now, null);
  assert.equal(evening.next?.code, "M347");
});

test("exam within 7 days, nothing when there is no course nor exam", () => {
  assert.deepEqual(widgetFrom(input("08:00")).exam, { title: "Test 3 · M295", date: "2026-11-20", day: "ven. 20", inDays: 2 });
  const empty = widgetFrom({ ...input("08:00", "2026-12-24"), exams: [] });
  assert.equal(empty.now, null);
  assert.equal(empty.next, null);
  assert.equal(empty.exam, null);
});
