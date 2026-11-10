import { describe, expect, it } from "vitest";
import { DAILY_BAN_MS, DAILY_REVIEW_MS, DAILY_ROUNDS, checkDailyBot, compareDailyScores, dailyDate, dailyDifficulty, dailyQuestion, dailyTimeLimitMs, evaluateText, isDailyDate, shiftDailyDate } from "../src";

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
