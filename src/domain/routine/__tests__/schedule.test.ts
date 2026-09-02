import {
  EVERY_DAY,
  WEEKDAY_DAYS,
  WEEKEND_DAYS,
  hasWeekday,
  isDueOn,
  isValidMask,
  maskOf,
  scheduleLabel,
  toggleWeekday,
  weekdaysOf,
} from "@/domain/routine/schedule";

describe("weekday masks", () => {
  it("round-trips a set of days", () => {
    const mask = maskOf([1, 3, 5]);
    expect(weekdaysOf(mask)).toEqual([1, 3, 5]);
    expect(hasWeekday(mask, 3)).toBe(true);
    expect(hasWeekday(mask, 4)).toBe(false);
  });

  it("names the sets people name", () => {
    expect(weekdaysOf(EVERY_DAY)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(weekdaysOf(WEEKDAY_DAYS)).toEqual([1, 2, 3, 4, 5]);
    expect(weekdaysOf(WEEKEND_DAYS)).toEqual([0, 6]);
  });

  it("keeps the days in Sunday-first order however they were given", () => {
    expect(weekdaysOf(maskOf([5, 0, 2]))).toEqual([0, 2, 5]);
  });
});

describe("toggleWeekday", () => {
  it("adds and removes a day", () => {
    const monday = maskOf([1]);
    const both = toggleWeekday(monday, 3);
    expect(weekdaysOf(both)).toEqual([1, 3]);
    expect(weekdaysOf(toggleWeekday(both, 1))).toEqual([3]);
  });

  it("refuses to empty the schedule", () => {
    const monday = maskOf([1]);
    expect(toggleWeekday(monday, 1)).toBe(monday);
  });
});

describe("isValidMask", () => {
  it("takes every real schedule and nothing else", () => {
    expect(isValidMask(1)).toBe(true);
    expect(isValidMask(EVERY_DAY)).toBe(true);
    expect(isValidMask(0)).toBe(false);
    expect(isValidMask(128)).toBe(false);
    expect(isValidMask(1.5)).toBe(false);
  });
});

describe("isDueOn", () => {
  // 2026-09-02 is a Wednesday (weekday 3).
  it("answers by the weekday the date falls on", () => {
    expect(isDueOn(maskOf([3]), "2026-09-02")).toBe(true);
    expect(isDueOn(maskOf([3]), "2026-09-03")).toBe(false);
    expect(isDueOn(EVERY_DAY, "2026-09-03")).toBe(true);
  });

  it("is not due on something that isn't a date", () => {
    expect(isDueOn(EVERY_DAY, "sometime")).toBe(false);
  });
});

describe("scheduleLabel", () => {
  it("uses a name where there is one, and the days where there isn't", () => {
    expect(scheduleLabel(EVERY_DAY)).toBe("Every day");
    expect(scheduleLabel(WEEKDAY_DAYS)).toBe("Weekdays");
    expect(scheduleLabel(WEEKEND_DAYS)).toBe("Weekends");
    expect(scheduleLabel(maskOf([1, 3, 5]))).toBe("Mo We Fr");
  });
});
