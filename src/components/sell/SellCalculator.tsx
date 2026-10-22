"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import {
  computeQuote,
  firstUnansweredSection,
  isSectionComplete,
  SECTION_ORDER,
  SECTION_TITLES,
  toggleOption,
  type Answers,
  type EvalQuestion,
  type EvalSection,
  type QuoteResult,
} from "@/lib/sell/pricing";
import { EvaluationSummary } from "./EvaluationSummary";
import { PickupForm, type PickupDateOption } from "./PickupForm";
import { QuestionStep } from "./QuestionStep";
import { parseSavedAnswers, readSavedRaw, saveAnswers } from "./savedAnswers";

interface SellCalculatorProps {
  variantId: number;
  basePrice: number;
  deviceTitle: string;
  variantLabel: string;
  questions: readonly EvalQuestion[];
  signedIn: boolean;
  loginHref: string;
  dates: readonly PickupDateOption[];
  defaultName: string;
  defaultPhone: string;
}

type Step = EvalSection | "pickup";

const noSubscribe = () => () => {};

function toPayload(answers: Answers): string {
  return JSON.stringify(Object.entries(answers).map(([id, optionIds]) => ({ questionId: Number(id), optionIds })));
}

export function SellCalculator(props: SellCalculatorProps) {
  const { variantId, basePrice, questions } = props;
  // null = untouched in this visit; fall back to answers saved before /login
  const [edited, setEdited] = useState<Answers | null>(null);
  const [chosenStep, setChosenStep] = useState<number | null>(null);
  const savedRaw = useSyncExternalStore(noSubscribe, () => readSavedRaw(variantId), () => null);

  const steps = useMemo<Step[]>(
    () => [...SECTION_ORDER.filter((s) => questions.some((q) => q.section === s)), "pickup"],
    [questions],
  );
  const restored = useMemo(() => {
    const saved = parseSavedAnswers(savedRaw);
    // Ignore saved answers if the questions changed since they were stored
    return saved && computeQuote(basePrice, questions, saved).ok ? saved : null;
  }, [savedRaw, basePrice, questions]);

  const answers = edited ?? restored ?? {};
  const stepIndex = chosenStep ?? (restored ? steps.length - 1 : 0);
  const setStepIndex = setChosenStep;
  const step = steps[stepIndex];
  const unanswered = firstUnansweredSection(questions, answers);
  const quote = computeQuote(basePrice, questions, answers);
  const canContinue = step !== "pickup" && isSectionComplete(questions, answers, step);

  function handleToggle(question: EvalQuestion, optionId: number) {
    const next = toggleOption(answers, question, optionId);
    setEdited(next);
    saveAnswers(variantId, next);
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
      <div>
        <ol className="mb-6 flex flex-wrap gap-2 text-xs" aria-label="Steps">
          {steps.map((s, i) => (
            <li
              key={s}
              aria-current={i === stepIndex ? "step" : undefined}
              className={`rounded-full px-3 py-1 ${i === stepIndex ? "bg-brand text-brand-contrast" : "bg-surface text-muted"}`}
            >
              {s === "pickup" ? "Pickup" : SECTION_TITLES[s]}
            </li>
          ))}
        </ol>

        <h2 className="mb-4 text-xl font-bold">{step === "pickup" ? "Book your free pickup" : SECTION_TITLES[step]}</h2>

        {step === "pickup" ? (
          <PickupStep {...props} answers={answers} quote={quote} />
        ) : (
          <QuestionStep questions={questions.filter((q) => q.section === step)} answers={answers} onToggle={handleToggle} />
        )}

        <div className="mt-8 flex gap-3">
          {stepIndex > 0 && (
            <button
              type="button"
              onClick={() => setStepIndex(stepIndex - 1)}
              className="rounded-lg border border-border px-5 py-2.5 font-medium hover:border-brand"
            >
              Back
            </button>
          )}
          {step !== "pickup" && (
            <button
              type="button"
              disabled={!canContinue}
              onClick={() => setStepIndex(stepIndex + 1)}
              className="rounded-lg bg-brand px-6 py-2.5 font-semibold text-brand-contrast hover:bg-brand-strong disabled:opacity-50"
            >
              Continue
            </button>
          )}
        </div>
      </div>

      <EvaluationSummary
        deviceTitle={props.deviceTitle}
        variantLabel={props.variantLabel}
        basePrice={basePrice}
        quote={quote}
        isComplete={unanswered === null}
      />
    </div>
  );
}

interface PickupStepProps extends SellCalculatorProps {
  answers: Answers;
  quote: QuoteResult;
}

function PickupStep({ signedIn, loginHref, answers, quote, variantId, dates, defaultName, defaultPhone }: PickupStepProps) {
  if (!quote.ok) return <p className="text-danger">Please go back and answer every question.</p>;
  if (!signedIn) {
    return (
      <div className="rounded-xl border border-border bg-surface p-5">
        <p>Log in with your mobile number or email to book the pickup. Your answers are saved.</p>
        <Link
          href={loginHref}
          className="mt-4 inline-block rounded-lg bg-brand px-6 py-2.5 font-semibold text-brand-contrast hover:bg-brand-strong"
        >
          Log in to continue
        </Link>
      </div>
    );
  }
  return (
    <PickupForm
      variantId={variantId}
      answersJson={toPayload(answers)}
      expectedPrice={quote.price}
      dates={dates}
      defaultName={defaultName}
      defaultPhone={defaultPhone}
    />
  );
}
