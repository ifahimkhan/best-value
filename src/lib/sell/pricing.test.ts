import { describe, expect, it } from "vitest";
import { computeQuote, firstUnansweredSection, isSectionComplete, toggleOption, type EvalQuestion } from "./pricing";

const QUESTIONS: EvalQuestion[] = [
  {
    id: 1,
    section: "question",
    inputType: "yes_no",
    title: "Switches on?",
    helpText: null,
    options: [
      { id: 11, label: "Yes", deductionType: "flat", deductionValue: 0 },
      { id: 12, label: "No", deductionType: "percent", deductionValue: 50 },
    ],
  },
  {
    id: 2,
    section: "defect",
    inputType: "multi",
    title: "Damage",
    helpText: null,
    options: [
      { id: 21, label: "Cracked glass", deductionType: "percent", deductionValue: 20 },
      { id: 22, label: "Dents", deductionType: "flat", deductionValue: 1000 },
    ],
  },
  {
    id: 3,
    section: "accessory",
    inputType: "multi",
    title: "Accessories",
    helpText: null,
    options: [
      { id: 31, label: "Box", deductionType: "flat", deductionValue: 500 },
      { id: 32, label: "Charger", deductionType: "flat", deductionValue: 400 },
    ],
  },
  {
    id: 4,
    section: "age",
    inputType: "single",
    title: "Age",
    helpText: null,
    options: [
      { id: 41, label: "New", deductionType: "percent", deductionValue: 0 },
      { id: 42, label: "Old", deductionType: "percent", deductionValue: 10 },
    ],
  },
];

const PERFECT = { 1: [11], 2: [], 3: [31, 32], 4: [41] };

describe("computeQuote", () => {
  it("returns the base price when nothing is wrong", () => {
    const result = computeQuote(40000, QUESTIONS, PERFECT);
    expect(result).toEqual({ ok: true, price: 40000, deductions: [] });
  });

  it("applies percent deductions on the base price, not compounded", () => {
    const result = computeQuote(40000, QUESTIONS, { ...PERFECT, 1: [12], 4: [42] });
    // 50% + 10% of 40000 = 24000
    expect(result).toMatchObject({ ok: true, price: 16000 });
  });

  it("adds flat and percent deductions from multi-select defects", () => {
    const result = computeQuote(40000, QUESTIONS, { ...PERFECT, 2: [21, 22] });
    expect(result).toMatchObject({ ok: true, price: 40000 - 8000 - 1000 });
  });

  it("deducts accessories that are NOT selected", () => {
    const result = computeQuote(40000, QUESTIONS, { ...PERFECT, 3: [32] });
    expect(result).toEqual({
      ok: true,
      price: 39500,
      deductions: [{ questionId: 3, label: "Missing: Box", amount: 500 }],
    });
  });

  it("never goes below zero", () => {
    const result = computeQuote(1000, QUESTIONS, { 1: [12], 2: [21, 22], 3: [], 4: [42] });
    expect(result).toMatchObject({ ok: true, price: 0 });
  });

  it("rounds down to whole rupees", () => {
    const result = computeQuote(999, QUESTIONS, { ...PERFECT, 4: [42] });
    expect(result).toMatchObject({ ok: true, price: 899 });
  });

  it("ignores duplicate option ids", () => {
    const result = computeQuote(40000, QUESTIONS, { ...PERFECT, 2: [22, 22] });
    expect(result).toMatchObject({ ok: true, price: 39000 });
  });

  it("rejects a missing answer for a single-choice question", () => {
    const result = computeQuote(40000, QUESTIONS, { 1: [11], 2: [], 3: [] });
    expect(result).toEqual({ ok: false, error: "Please answer: Age", questionId: 4 });
  });

  it("rejects two answers for a yes/no question", () => {
    const result = computeQuote(40000, QUESTIONS, { ...PERFECT, 1: [11, 12] });
    expect(result).toMatchObject({ ok: false, questionId: 1 });
  });

  it("rejects an option that belongs to another question", () => {
    const result = computeQuote(40000, QUESTIONS, { ...PERFECT, 2: [41] });
    expect(result).toMatchObject({ ok: false, questionId: 2 });
  });

  it("rejects answers for unknown questions", () => {
    const result = computeQuote(40000, QUESTIONS, { ...PERFECT, 99: [1] });
    expect(result).toMatchObject({ ok: false });
  });

  it("treats a missing multi-select answer as nothing selected", () => {
    const result = computeQuote(40000, QUESTIONS, { 1: [11], 3: [31, 32], 4: [41] });
    expect(result).toMatchObject({ ok: true, price: 40000 });
  });
});

describe("deduction rounding and accessory rules", () => {
  const percent = (value: number): EvalQuestion => ({
    id: 9,
    section: "defect",
    inputType: "multi",
    title: "Damage",
    helpText: null,
    options: [
      { id: 91, label: "A", deductionType: "percent", deductionValue: value },
      { id: 92, label: "B", deductionType: "percent", deductionValue: value },
      { id: 93, label: "C", deductionType: "percent", deductionValue: value },
    ],
  });

  it("rounds each deduction to paise so float error cannot cost a rupee", () => {
    // 0.1 + 0.2 style drift: 3 x 0.7% of 10000 = 210 exactly
    const result = computeQuote(10000, [percent(0.7)], { 9: [91, 92, 93] });
    expect(result).toMatchObject({ ok: true, price: 9790 });
  });

  it("only inverts multi-select accessory questions", () => {
    const yesNoAccessory: EvalQuestion = {
      id: 8,
      section: "accessory",
      inputType: "yes_no",
      title: "Have the box?",
      helpText: null,
      options: [
        { id: 81, label: "Yes", deductionType: "flat", deductionValue: 0 },
        { id: 82, label: "No", deductionType: "flat", deductionValue: 500 },
      ],
    };
    expect(computeQuote(10000, [yesNoAccessory], { 8: [81] })).toMatchObject({ ok: true, price: 10000 });
    expect(computeQuote(10000, [yesNoAccessory], { 8: [82] })).toMatchObject({ ok: true, price: 9500 });
  });
});

describe("isSectionComplete", () => {
  it("checks only the questions in the given section", () => {
    expect(isSectionComplete(QUESTIONS, { 1: [11] }, "question")).toBe(true);
    expect(isSectionComplete(QUESTIONS, {}, "question")).toBe(false);
    // Multi-select sections are always complete
    expect(isSectionComplete(QUESTIONS, {}, "defect")).toBe(true);
    expect(isSectionComplete(QUESTIONS, { 1: [11] }, "age")).toBe(false);
  });
});

describe("firstUnansweredSection", () => {
  it("returns null when all required questions are answered", () => {
    expect(firstUnansweredSection(QUESTIONS, PERFECT)).toBeNull();
  });

  it("returns the section of the first unanswered single-choice question", () => {
    expect(firstUnansweredSection(QUESTIONS, { 1: [11] })).toBe("age");
    expect(firstUnansweredSection(QUESTIONS, {})).toBe("question");
  });
});

describe("toggleOption", () => {
  it("replaces the answer for single-choice questions", () => {
    const next = toggleOption({ 1: [11] }, QUESTIONS[0], 12);
    expect(next[1]).toEqual([12]);
  });

  it("adds and removes options for multi-select questions without mutating", () => {
    const start = { 2: [21] };
    const added = toggleOption(start, QUESTIONS[1], 22);
    expect(added[2]).toEqual([21, 22]);
    expect(start[2]).toEqual([21]);
    expect(toggleOption(added, QUESTIONS[1], 21)[2]).toEqual([22]);
  });
});
