"use client";

import type { Answers, EvalQuestion } from "@/lib/sell/pricing";

interface QuestionStepProps {
  questions: readonly EvalQuestion[];
  answers: Answers;
  onToggle: (question: EvalQuestion, optionId: number) => void;
}

export function QuestionStep({ questions, answers, onToggle }: QuestionStepProps) {
  return (
    <div className="space-y-6">
      {questions.map((question) => {
        const selected = answers[question.id] ?? [];
        const isMulti = question.inputType === "multi";
        return (
          <fieldset key={question.id}>
            <legend className="font-semibold">{question.title}</legend>
            {question.helpText && <p className="mt-1 text-sm text-muted">{question.helpText}</p>}
            <div className={`mt-3 grid gap-2 ${question.inputType === "yes_no" ? "grid-cols-2 sm:max-w-xs" : "sm:grid-cols-2"}`}>
              {question.options.map((option) => {
                const isSelected = selected.includes(option.id);
                return (
                  <label
                    key={option.id}
                    className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 transition ${
                      isSelected ? "border-brand bg-brand-soft" : "border-border bg-surface hover:border-brand"
                    }`}
                  >
                    <input
                      type={isMulti ? "checkbox" : "radio"}
                      name={`q-${question.id}`}
                      checked={isSelected}
                      onChange={() => onToggle(question, option.id)}
                      className="accent-brand"
                    />
                    <span>{option.label}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}
