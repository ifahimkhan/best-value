"use client";

import { useEffect } from "react";
import { clearAllSavedAnswers } from "./savedAnswers";

/** Rendered on the booking confirmation: the saved calculator answers are no longer needed. */
export function ClearSavedAnswers() {
  useEffect(() => {
    clearAllSavedAnswers();
  }, []);
  return null;
}
