import { describe, expect, it } from "vitest";
import { GameEngine, MAX_EXPRESSION_LENGTH, defaultSettings, evaluateStrict, fitsTiles, numbersOf, parseExpression } from "../src";

const value = (text: string, ops?: Parameters<typeof evaluateStrict>[1]) => {
  const tree = parseExpression(text);
  return tree ? evaluateStrict(tree, ops) : null;
};

describe("expressions saisies", () => {
  it("respecte les priorités et les parenthèses, avec tous les symboles acceptés", () => {
    expect(value("(75 − 5) × 3 + 8")).toBe(218);
    expect(value("2 + 3 * 4")).toBe(14);
    expect(value("(2+3)x4")).toBe(20);
    expect(value("100 / 4 - 5")).toBe(20);
    expect(value("((7))")).toBe(7);
  });

  it("refuse une saisie mal formée", () => {
    for (const text of ["", " ", "3 +", "(3 + 4", "3 + 4)", "3 4", "-3 + 4", "3 ^ 2", "3 + a", "1234567 + 1", "()"]) {
      expect(parseExpression(text), text).toBeNull();
    }
    expect(parseExpression("1+".repeat(MAX_EXPRESSION_LENGTH) + "1")).toBeNull();
  });

  it("refuse les intermédiaires négatifs, les divisions non exactes et les opérations non permises", () => {
    expect(value("3 − 5 + 10")).toBeNaN();
    expect(value("7 ÷ 2 × 2")).toBeNaN();
    expect(value("6 ÷ (3 − 3)")).toBeNaN();
    expect(value("3 × 4", ["add", "sub"])).toBeNaN();
    expect(value("3 + 4", ["add", "sub"])).toBe(7);
  });

  it("vérifie les plaques : chacune au plus une fois, aucune inventée", () => {
    const tiles = [5, 5, 3, 100];
    const nums = (text: string) => numbersOf(parseExpression(text)!);
    expect(fitsTiles(nums("100 − 5 × 5"), tiles)).toBe(true);
    expect(fitsTiles(nums("3"), tiles)).toBe(true);
    expect(fitsTiles(nums("5 × 5 × 5"), tiles)).toBe(false);
    expect(fitsTiles(nums("100 + 7"), tiles)).toBe(false);
  });
});

describe("forme des réponses", () => {
  it("le calcul standard refuse une réponse qui n'est pas un nombre, sans consommer l'essai", () => {
    const g = new GameEngine(defaultSettings(1), [{ id: "p0", name: "A" }], "forme");
    const r = g.startRound(0)!;
    expect(g.submit("p0", { expr: "1 + 1" }, 10)).toMatchObject({ accepted: false, reason: "invalid-value" });
    expect(g.submit("p0", { op: "add" }, 10)).toMatchObject({ accepted: false, reason: "invalid-value" });
    expect(g.submit("p0", { value: r.question.answer }, 20)).toMatchObject({ accepted: true, correct: true });
    expect(r.answers[0]).toMatchObject({ value: r.question.answer, text: null });
  });
});
