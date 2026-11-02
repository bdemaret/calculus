import { describe, expect, it } from "vitest";
import { DAILY_ROUNDS, compareDailyScores, dailyDate, dailyDifficulty, dailyQuestion, dailyTimeLimitMs, evaluateText, isDailyDate, shiftDailyDate } from "../src";

describe("calcul du jour", () => {
  it("change de jour à minuit, heure de Paris, été comme hiver", () => {
    // Hiver : UTC+1.
    expect(dailyDate(Date.UTC(2026, 10, 1, 22, 59, 59))).toBe("2026-11-01");
    expect(dailyDate(Date.UTC(2026, 10, 1, 23, 0, 0))).toBe("2026-11-02");
    // Été : UTC+2.
    expect(dailyDate(Date.UTC(2026, 6, 1, 21, 59, 59))).toBe("2026-07-01");
    expect(dailyDate(Date.UTC(2026, 6, 1, 22, 0, 0))).toBe("2026-07-02");
  });

  it("valide et décale les dates", () => {
    expect(isDailyDate("2026-11-01")).toBe(true);
    expect(isDailyDate("2026-02-30")).toBe(false);
    expect(isDailyDate("2026-11-01'; --")).toBe(false);
    expect(shiftDailyDate("2026-03-01", -1)).toBe("2026-02-28");
    expect(shiftDailyDate("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("pose cinq calculs, un par niveau, identiques pour une même graine", () => {
    expect(DAILY_ROUNDS).toBe(5);
    for (let day = 0; day < 200; day++) {
      const seed = `graine-${day}`;
      for (let i = 0; i < DAILY_ROUNDS; i++) {
        const q = dailyQuestion(seed, i);
        expect(q).toEqual(dailyQuestion(seed, i));
        expect(q.difficulty).toBe(i + 1);
        expect(q.difficulty).toBe(dailyDifficulty(i));
        expect(evaluateText(q.text)).toBe(q.answer);
        expect(dailyTimeLimitMs(i)).toBeGreaterThan(0);
      }
    }
    expect(dailyQuestion("a", 4).text).not.toBe(dailyQuestion("b", 4).text);
  });

  it("classe par bons calculs, puis par temps total", () => {
    const sorted = [
      { correct: 3, totalTimeMs: 1000 },
      { correct: 5, totalTimeMs: 40_000 },
      { correct: 5, totalTimeMs: 20_000 },
    ].sort(compareDailyScores);
    expect(sorted.map((s) => s.totalTimeMs)).toEqual([20_000, 40_000, 1000]);
  });
});
