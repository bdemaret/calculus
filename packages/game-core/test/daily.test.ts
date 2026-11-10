import { describe, expect, it } from "vitest";
import { DAILY_BAN_MS, DAILY_REVIEW_MS, DAILY_ROUNDS, DAILY_STREAK_WEEK, checkDailyBot, compareDailyScores, dailyDate, dailyEndsAt, dailyStreak, longestDailyStreak, dailyDifficulty, dailyQuestion, dailyTimeLimitMs, evaluateText, isDailyDate, shiftDailyDate } from "../src";

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

  describe("anti-bot", () => {
    const run = (...times: number[]) => times.map((timeMs) => ({ correct: true, timeMs }));

    it("laisse passer un essai humain, même très rapide", () => {
      expect(checkDailyBot(run(900, 1400, 2500, 4000, 7000))).toEqual({ verdict: "ok", rules: [] });
      expect(checkDailyBot([])).toEqual({ verdict: "ok", rules: [] });
    });

    it("bannit dès une bonne réponse physiquement impossible, au même seuil à tous les niveaux", () => {
      expect(DAILY_BAN_MS).toBe(400);
      for (let index = 0; index < DAILY_ROUNDS; index++) {
        const answers = run(...[3000, 3000, 3000, 3000].slice(0, index), DAILY_BAN_MS - 1);
        expect(checkDailyBot(answers)).toEqual({ verdict: "bot", rules: ["too-fast"] });
        answers[index]!.timeMs = DAILY_BAN_MS;
        expect(checkDailyBot(answers).verdict).not.toBe("bot");
      }
    });

    it("ne tient pas compte d'une mauvaise réponse rapide", () => {
      expect(checkDailyBot([{ correct: false, timeMs: 50 }])).toEqual({ verdict: "ok", rules: [] });
    });

    it("signale sans bannir une réponse rapide pour son niveau : le calcul peut être trivial (« 90 ÷ 10 »)", () => {
      expect([...DAILY_REVIEW_MS]).toEqual([400, 600, 800, 800, 800]);
      // En Facile, le seuil de signalement est celui du ban : rien entre les deux.
      expect(checkDailyBot(run(400))).toEqual({ verdict: "ok", rules: [] });
      expect(checkDailyBot(run(900, 599))).toEqual({ verdict: "suspect", rules: ["fast-for-level"] });
      expect(checkDailyBot(run(900, 600))).toEqual({ verdict: "ok", rules: [] });
      expect(checkDailyBot(run(900, 1400, 700))).toEqual({ verdict: "suspect", rules: ["fast-for-level"] });
      expect(checkDailyBot(run(900, 1400, 2500, 4000, 799))).toEqual({ verdict: "suspect", rules: ["fast-for-level"] });
      expect(checkDailyBot(run(900, 1400, 2500, 4000, 800))).toEqual({ verdict: "ok", rules: [] });
    });

    it("signale un sans-faute aux temps trop réguliers", () => {
      expect(checkDailyBot(run(2000, 2100, 2050, 2200, 2300))).toEqual({ verdict: "suspect", rules: ["flat-times"] });
      // Pas avant la fin de l'essai, ni avec une erreur.
      expect(checkDailyBot(run(2000, 2100, 2050, 2200)).verdict).toBe("ok");
      expect(checkDailyBot([...run(2000, 2100, 2050, 2200), { correct: false, timeMs: 2300 }]).verdict).toBe("ok");
    });
  });
});

describe("série du calcul du jour", () => {
  it("compte les jours de suite, hier compris tant qu'aujourd'hui n'est pas joué", () => {
    const days = ["2026-11-06", "2026-11-07", "2026-11-08"];
    // Joué aujourd'hui : la série inclut aujourd'hui.
    expect(dailyStreak(days, "2026-11-08")).toMatchObject({ current: 3, best: 3, playedToday: true });
    // Pas encore joué : la série d'hier tient jusqu'à minuit.
    expect(dailyStreak(days, "2026-11-09")).toMatchObject({ current: 3, best: 3, playedToday: false });
    // Un jour manqué : série perdue, le record reste.
    expect(dailyStreak(days, "2026-11-10")).toMatchObject({ current: 0, best: 3, playedToday: false });
    expect(dailyStreak([], "2026-11-10")).toMatchObject({ current: 0, best: 0, playedToday: false });
  });

  it("garde la plus longue série, dans le désordre, avec des doublons et à cheval sur deux mois", () => {
    const days = ["2026-11-02", "2026-10-30", "2026-11-01", "2026-10-31", "2026-10-31", "2026-11-05", "2026-11-06"];
    expect(dailyStreak(days, "2026-11-06")).toMatchObject({ current: 2, best: 4 });
    expect(longestDailyStreak(days)).toBe(4);
    expect(longestDailyStreak([])).toBe(0);
  });

  it("montre les sept derniers jours, aujourd'hui en dernier", () => {
    const { week } = dailyStreak(["2026-11-04", "2026-11-08", "2026-11-09"], "2026-11-10");
    expect(week).toHaveLength(DAILY_STREAK_WEEK);
    expect(week).toEqual([true, false, false, false, true, true, false]);
  });

  it("finit le jour à minuit, heure de Paris, changements d'heure compris", () => {
    // Hiver : minuit à Paris = 23 h UTC.
    expect(dailyEndsAt(Date.UTC(2026, 10, 10, 12, 0, 0))).toBe(Date.UTC(2026, 10, 10, 23, 0, 0));
    expect(dailyEndsAt(Date.UTC(2026, 10, 10, 23, 0, 0))).toBe(Date.UTC(2026, 10, 11, 23, 0, 0));
    expect(dailyEndsAt(Date.UTC(2026, 10, 10, 22, 59, 59, 500))).toBe(Date.UTC(2026, 10, 10, 23, 0, 0));
    // Été : 22 h UTC.
    expect(dailyEndsAt(Date.UTC(2026, 6, 1, 8, 30, 0))).toBe(Date.UTC(2026, 6, 1, 22, 0, 0));
    // 29 mars 2026 : jour de 23 h (début à 23 h UTC la veille, fin à 22 h UTC).
    expect(dailyEndsAt(Date.UTC(2026, 2, 28, 23, 30, 0))).toBe(Date.UTC(2026, 2, 29, 22, 0, 0));
    // 25 octobre 2026 : jour de 25 h (début à 22 h UTC la veille, fin à 23 h UTC).
    expect(dailyEndsAt(Date.UTC(2026, 9, 24, 22, 30, 0))).toBe(Date.UTC(2026, 9, 25, 23, 0, 0));
    for (let h = 0; h < 24 * 400; h += 7) {
      const now = Date.UTC(2026, 0, 1) + h * 3_600_000 + 1234;
      const end = dailyEndsAt(now);
      expect(dailyDate(end - 1)).toBe(dailyDate(now));
      expect(dailyDate(end)).not.toBe(dailyDate(now));
    }
  });
});
