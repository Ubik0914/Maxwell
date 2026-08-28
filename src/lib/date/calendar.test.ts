import {
  daysInMonth,
  firstWeekday,
  monthGrid,
  monthLabel,
  parseIsoDate,
  shiftMonth,
  toIsoDate,
} from "@/lib/date/calendar";

describe("parseIsoDate", () => {
  it("reads a date without going through a timezone", () => {
    expect(parseIsoDate("2026-08-28")).toEqual({
      year: 2026,
      month: 8,
      day: 28,
    });
  });

  it("rejects anything that isn't an ISO date", () => {
    for (const bad of ["", "2026-8-28", "28/08/2026", "2026-08-28T00:00:00Z"]) {
      expect(parseIsoDate(bad)).toBeNull();
    }
  });

  it("rejects a day the month does not have", () => {
    expect(parseIsoDate("2026-02-29")).toBeNull();
    expect(parseIsoDate("2024-02-29")).toEqual({
      year: 2024,
      month: 2,
      day: 29,
    });
    expect(parseIsoDate("2026-13-01")).toBeNull();
    expect(parseIsoDate("2026-00-10")).toBeNull();
    expect(parseIsoDate("2026-04-31")).toBeNull();
  });
});

describe("toIsoDate", () => {
  it("pads to the shape the database stores", () => {
    expect(toIsoDate(2026, 8, 3)).toBe("2026-08-03");
    expect(toIsoDate(2026, 12, 31)).toBe("2026-12-31");
  });

  it("round-trips with parseIsoDate", () => {
    const iso = "2026-01-09";
    const parsed = parseIsoDate(iso)!;
    expect(toIsoDate(parsed.year, parsed.month, parsed.day)).toBe(iso);
  });
});

describe("daysInMonth", () => {
  it("knows the short months and the leap years", () => {
    expect(daysInMonth({ year: 2026, month: 2 })).toBe(28);
    expect(daysInMonth({ year: 2024, month: 2 })).toBe(29);
    expect(daysInMonth({ year: 2000, month: 2 })).toBe(29);
    expect(daysInMonth({ year: 1900, month: 2 })).toBe(28);
    expect(daysInMonth({ year: 2026, month: 4 })).toBe(30);
    expect(daysInMonth({ year: 2026, month: 12 })).toBe(31);
  });
});

describe("firstWeekday", () => {
  it("is Sunday-based", () => {
    // 1 August 2026 is a Saturday; 1 September 2026 is a Tuesday.
    expect(firstWeekday({ year: 2026, month: 8 })).toBe(6);
    expect(firstWeekday({ year: 2026, month: 9 })).toBe(2);
  });
});

describe("shiftMonth", () => {
  it("moves within a year", () => {
    expect(shiftMonth({ year: 2026, month: 8 }, 1)).toEqual({
      year: 2026,
      month: 9,
    });
    expect(shiftMonth({ year: 2026, month: 8 }, -1)).toEqual({
      year: 2026,
      month: 7,
    });
  });

  it("crosses the year in both directions", () => {
    expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({
      year: 2027,
      month: 1,
    });
    expect(shiftMonth({ year: 2026, month: 1 }, -1)).toEqual({
      year: 2025,
      month: 12,
    });
    expect(shiftMonth({ year: 2026, month: 1 }, -13)).toEqual({
      year: 2024,
      month: 12,
    });
    expect(shiftMonth({ year: 2026, month: 6 }, 30)).toEqual({
      year: 2028,
      month: 12,
    });
  });
});

describe("monthGrid", () => {
  it("is whole weeks with the month's days in the middle", () => {
    const cells = monthGrid({ year: 2026, month: 8 });
    expect(cells.length % 7).toBe(0);
    // August 2026 starts on a Saturday: six blanks, then the 1st.
    expect(cells.slice(0, 6)).toEqual([null, null, null, null, null, null]);
    expect(cells[6]).toBe(1);
    expect(cells.filter((cell) => cell !== null)).toHaveLength(31);
  });

  it("puts every day under the weekday it falls on", () => {
    const cells = monthGrid({ year: 2026, month: 9 });
    // 1 September 2026 is a Tuesday — column 2, Sunday being 0.
    expect(cells.indexOf(1) % 7).toBe(2);
    // 28 September 2026 is a Monday.
    expect(cells.indexOf(28) % 7).toBe(1);
  });

  it("needs no leading blanks when the month starts on a Sunday", () => {
    // 1 February 2026 is a Sunday.
    expect(monthGrid({ year: 2026, month: 2 })[0]).toBe(1);
  });
});

describe("monthLabel", () => {
  it("names the month a person would say", () => {
    expect(monthLabel({ year: 2026, month: 8 })).toBe("August 2026");
    expect(monthLabel({ year: 2026, month: 1 })).toBe("January 2026");
  });
});
