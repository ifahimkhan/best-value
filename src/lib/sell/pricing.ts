// Buyback pricing engine. Pure functions shared by the calculator UI (live
// estimate) and the booking action (authoritative re-price on the server).
//
// Rules:
//  * Percent deductions are taken from the base price, never compounded.
//  * Multi-select accessory questions deduct for the options the customer
//    does NOT have.
//  * Each deduction is rounded to paise before summing (no float drift).
//  * The quote is rounded down to whole rupees and never goes below zero.

export type EvalSection = "question" | "defect" | "functional" | "accessory" | "age";
export type EvalInput = "yes_no" | "single" | "multi";

export interface EvalOption {
  id: number;
  label: string;
  deductionType: "flat" | "percent";
  deductionValue: number;
}

export interface EvalQuestion {
  id: number;
  section: EvalSection;
  inputType: EvalInput;
  title: string;
  helpText: string | null;
  options: readonly EvalOption[];
}

/** questionId -> selected option ids */
export type Answers = Readonly<Record<number, readonly number[]>>;

export interface Deduction {
  questionId: number;
  label: string;
  amount: number;
}

export type QuoteResult =
  | { ok: true; price: number; deductions: Deduction[] }
  | { ok: false; error: string; questionId?: number };

export const SECTION_ORDER: readonly EvalSection[] = ["question", "defect", "functional", "accessory", "age"];

export const SECTION_TITLES: Readonly<Record<EvalSection, string>> = {
  question: "About your device",
  defect: "Screen and body",
  functional: "Working parts",
  accessory: "Accessories",
  age: "Device age",
};

function isSingleChoice(question: EvalQuestion): boolean {
  return question.inputType !== "multi";
}

function selectedFor(question: EvalQuestion, answers: Answers): number[] {
  return [...new Set(answers[question.id] ?? [])];
}

function deductionAmount(basePrice: number, option: EvalOption): number {
  const raw = option.deductionType === "percent" ? (basePrice * option.deductionValue) / 100 : option.deductionValue;
  return Math.round(raw * 100) / 100;
}

function questionDeductions(basePrice: number, question: EvalQuestion, selected: readonly number[]): Deduction[] {
  const isAccessory = question.section === "accessory" && question.inputType === "multi";
  return question.options
    .filter((option) => selected.includes(option.id) !== isAccessory)
    .map((option) => ({
      questionId: question.id,
      label: isAccessory ? `Missing: ${option.label}` : option.label,
      amount: deductionAmount(basePrice, option),
    }))
    .filter((d) => d.amount > 0);
}

function validateQuestion(question: EvalQuestion, selected: readonly number[]): string | null {
  const optionIds = new Set(question.options.map((o) => o.id));
  if (selected.some((id) => !optionIds.has(id))) return `Invalid answer for: ${question.title}`;
  if (isSingleChoice(question) && selected.length !== 1) return `Please answer: ${question.title}`;
  return null;
}

export function computeQuote(basePrice: number, questions: readonly EvalQuestion[], answers: Answers): QuoteResult {
  const knownIds = new Set(questions.map((q) => q.id));
  if (Object.keys(answers).some((id) => !knownIds.has(Number(id)))) {
    return { ok: false, error: "Some answers do not match this device. Please start again." };
  }

  const deductions: Deduction[] = [];
  for (const question of questions) {
    const selected = selectedFor(question, answers);
    const error = validateQuestion(question, selected);
    if (error) return { ok: false, error, questionId: question.id };
    deductions.push(...questionDeductions(basePrice, question, selected));
  }

  const totalPaise = deductions.reduce((sum, d) => sum + Math.round(d.amount * 100), 0);
  return { ok: true, price: Math.max(0, Math.floor((Math.round(basePrice * 100) - totalPaise) / 100)), deductions };
}

/** True when every single-choice question in the section has exactly one answer. */
export function isSectionComplete(questions: readonly EvalQuestion[], answers: Answers, section: EvalSection): boolean {
  return questions.every((q) => q.section !== section || !isSingleChoice(q) || selectedFor(q, answers).length === 1);
}

/** Section of the first required question still unanswered, or null when complete. */
export function firstUnansweredSection(questions: readonly EvalQuestion[], answers: Answers): EvalSection | null {
  const missing = questions.find((q) => isSingleChoice(q) && selectedFor(q, answers).length !== 1);
  return missing?.section ?? null;
}

/** Returns new answers with the option chosen (single) or toggled (multi). */
export function toggleOption(answers: Answers, question: EvalQuestion, optionId: number): Answers {
  const current = answers[question.id] ?? [];
  if (isSingleChoice(question)) return { ...answers, [question.id]: [optionId] };
  const next = current.includes(optionId) ? current.filter((id) => id !== optionId) : [...current, optionId];
  return { ...answers, [question.id]: next };
}
