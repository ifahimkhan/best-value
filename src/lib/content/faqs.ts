import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { createPublicClient } from "@/lib/supabase/public";

export const FAQS_TAG = "faqs";

export const FAQ_TOPICS = ["selling", "buying", "payments", "general"] as const;
export type FaqTopic = (typeof FAQ_TOPICS)[number];

export const FAQ_TOPIC_LABELS: Readonly<Record<FaqTopic, string>> = {
  selling: "Selling your device",
  buying: "Buying from the store",
  payments: "Payments and refunds",
  general: "General",
};

export interface Faq {
  id: number;
  question: string;
  answer: string;
  topic: FaqTopic;
}

const faqRowSchema = z.object({
  id: z.number(),
  question: z.string(),
  answer: z.string(),
  topic: z.enum(FAQ_TOPICS).catch("general"),
});

export function parseFaqRows(rows: unknown): Faq[] {
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row) => {
    const parsed = faqRowSchema.safeParse(row);
    return parsed.success ? [parsed.data] : [];
  });
}

/** FAQs in topic order, keeping sort order inside each topic. */
export function groupFaqs(faqs: readonly Faq[]): { topic: FaqTopic; label: string; items: Faq[] }[] {
  return FAQ_TOPICS.map((topic) => ({
    topic,
    label: FAQ_TOPIC_LABELS[topic],
    items: faqs.filter((faq) => faq.topic === topic),
  })).filter((group) => group.items.length > 0);
}

/** Active FAQs, cached for hours. */
export async function listFaqs(): Promise<Faq[]> {
  "use cache";
  cacheTag(FAQS_TAG);
  const { data, error } = await createPublicClient()
    .from("faqs")
    .select("id, question, answer, topic")
    .eq("is_active", true)
    .order("sort_order");
  if (error) {
    cacheLife("seconds");
    logger.error("Failed to load FAQs", error);
    return [];
  }
  cacheLife("hours");
  return parseFaqRows(data);
}
