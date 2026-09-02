import {
  currentStreak,
  dueDatesBackFrom,
  recentHistory,
} from "@/domain/routine/history";
import { EVERY_DAY, maskOf } from "@/domain/routine/schedule";

// 2026-09-02 is a Wednesday.
const WEDNESDAY = "2026-09-02";
const MON_WED_FRI = maskOf([1, 3, 5]);

describe("dueDatesBackFrom", () => {
  it("counts back day by day when every day is due", () => {
    expect(dueDatesBackFrom(EVERY_DAY, WEDNESDAY, 3)).toEqual([
      "2026-09-02",
      "2026-09-01",
      "2026-08-31",
    ]);
  });

  it("steps over the days it is not due on", () => {
    expect(dueDatesBackFrom(MON_WED_FRI, WEDNESDAY, 3)).toEqual([
      "2026-09-02",
      "2026-08-31",
      "2026-08-28",
    ]);
  });

  it("starts at the previous due day when today isn't one", () => {
    // Thursday, with a Mon/Wed/Fri routine.
    expect(dueDatesBackFrom(MON_WED_FRI, "2026-09-03", 1)).toEqual([
      "2026-09-02",
    ]);
  });
});

describe("currentStreak", () => {
  it("counts consecutive done days", () => {
    const done = new Set(["2026-09-02", "2026-09-01", "2026-08-31"]);
    expect(currentStreak(EVERY_DAY, done, WEDNESDAY)).toBe(3);
  });

  it("stops at the first missed day", () => {
    const done = new Set(["2026-09-02", "2026-08-31"]);
    expect(currentStreak(EVERY_DAY, done, WEDNESDAY)).toBe(1);
  });

  it("leaves yesterday's streak standing while today is still pending", () => {
    const done = new Set(["2026-09-01", "2026-08-31"]);
    expect(currentStreak(EVERY_DAY, done, WEDNESDAY)).toBe(2);
  });

  it("does not count a day it was never due on as a miss", () => {
    // Mon/Wed/Fri, done on every one of them; the Tuesday between is
    // not a gap.
    const done = new Set(["2026-09-02", "2026-08-31", "2026-08-28"]);
    expect(currentStreak(MON_WED_FRI, done, WEDNESDAY)).toBe(3);
  });

  it("is zero when nothing has been done", () => {
    expect(currentStreak(EVERY_DAY, new Set(), WEDNESDAY)).toBe(0);
  });
});

describe("recentHistory", () => {
  it("reads oldest first and says which were done", () => {
    const done = new Set(["2026-09-02", "2026-08-31"]);
    expect(recentHistory(EVERY_DAY, done, WEDNESDAY, 3)).toEqual([
      { date: "2026-08-31", done: true },
      { date: "2026-09-01", done: false },
      { date: "2026-09-02", done: true },
    ]);
  });
});
