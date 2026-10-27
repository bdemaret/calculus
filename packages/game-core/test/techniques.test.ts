import { describe, expect, it } from "vitest";
import {
  DETECTION_ORDER,
  DIFFICULTIES,
  TECHNIQUES,
  TECHNIQUE_IDS,
  detectTechnique,
  evaluateText,
  explainTechnique,
  generateDrill,
  generateQuestion,
  renderTokens,
  techniquesOfLevel,
  LEVELS,
  type TechniqueHint,
} from "../src";

/** Chaque étape tombe juste, sans résultat intermédiaire négatif ni division inexacte. */
function expectSoundSteps(hint: TechniqueHint) {
  expect(hint.steps.length).toBeGreaterThan(0);
  for (const s of hint.steps) {
    expect(Number.isInteger(s.value) && s.value >= 0, `${hint.technique} : ${s.text}`).toBe(true);
    expect(evaluateText(s.text), `${hint.technique} : ${s.text}`).toBe(s.value);
  }
  expect(evaluateText(hint.target)).toBe(hint.result);
}

describe("techniques de calcul", () => {
  it("chaque technique est rangée une fois dans l'ordre de recherche", () => {
    expect([...DETECTION_ORDER].sort()).toEqual([...TECHNIQUE_IDS].sort());
    expect(DIFFICULTIES.flatMap((d) => techniquesOfLevel(d).map((t) => t.id))).toEqual([...TECHNIQUE_IDS]);
    for (const d of DIFFICULTIES) expect(techniquesOfLevel(d).length).toBeGreaterThan(0);
  });

  it("l'exemple de chaque technique est reconnu par elle", () => {
    for (const id of TECHNIQUE_IDS) {
      const hint = detectTechnique(renderTokens(TECHNIQUES[id].example));
      expect(hint?.technique, id).toBe(id);
      expectSoundSteps(hint!);
    }
  });

  it("les calculs d'entraînement sont reconnus, justes et déterministes", () => {
    for (const id of TECHNIQUE_IDS) {
      const texts = new Set<string>();
      for (let i = 0; i < 300; i++) {
        const q = generateDrill(id, "graine", i);
        expect(q).toEqual(generateDrill(id, "graine", i));
        expect(evaluateText(q.text)).toBe(q.answer);
        const hint = detectTechnique(q.text);
        expect(hint?.technique, `${id} : ${q.text}`).toBe(id);
        expect(hint!.result).toBe(q.answer);
        expectSoundSteps(hint!);
        texts.add(q.text);
      }
      // Assez de variété : l'exemple de secours ne sert presque jamais.
      expect(texts.size, id).toBeGreaterThan(5);
    }
  });

  it("les explications des calculs du jeu tombent toujours juste", () => {
    for (const difficulty of DIFFICULTIES) {
      const operations = LEVELS[difficulty].defaultOperations;
      for (let i = 0; i < 2000; i++) {
        const q = generateQuestion("partie", i, { difficulty, operations, parentheses: true, powerMax: 10 });
        const hint = detectTechnique(q.text);
        if (hint) expectSoundSteps(hint);
      }
    }
  });

  it("exemples précis", () => {
    expect(detectTechnique("48 × 5")?.steps.map((s) => s.text)).toEqual(["48 × 10", "480 ÷ 2"]);
    expect(detectTechnique("8 + 5")?.steps.map((s) => s.text)).toEqual(["8 + 2", "10 + 3"]);
    expect(detectTechnique("35²")?.steps.map((s) => s.value)).toEqual([12, 1225]);
    expect(detectTechnique("√576")?.steps.map((s) => s.value)).toEqual([400, 900, 625, 576]);
    expect(detectTechnique("2⁸")?.steps.map((s) => s.value)).toEqual([1024, 512, 256]);
    expect(detectTechnique("25 × 7 × 4")?.steps.map((s) => s.text)).toEqual(["25 × 4", "100 × 7"]);
    // Un morceau de calcul plus long, désigné tel quel.
    const hint = detectTechnique("200 − 17 × 9");
    expect(hint).toMatchObject({ technique: "mul-by-9", target: "17 × 9", result: 153 });
  });

  it("les tables ne déclenchent pas de conseil", () => {
    for (const text of ["3 × 5", "7 × 9", "2 + 3", "5 + 4", "12 ÷ 4", "6 − 2", "4 × 25"]) expect(detectTechnique(text), text).toBeNull();
  });

  it("refuse un énoncé incomplet ou mal formé", () => {
    for (const text of ["23 + ? = 41", "12 ? 4", "(3 + 4", "", "abc"]) expect(detectTechnique(text), text).toBeNull();
  });

  it("explique une technique donnée même si une autre passe avant", () => {
    // 15 × 15 : un carré en 5 d'abord, mais aussi une multiplication par 15.
    expect(detectTechnique("15 × 15")?.technique).toBe("square-ending-5");
    expect(explainTechnique("mul-by-15", "15 × 15")?.result).toBe(225);
    expect(explainTechnique("mul-by-11", "15 × 15")).toBeNull();
  });
});
