import type { ReactNode } from "react";

interface ContentPageProps {
  title: string;
  intro?: ReactNode;
  /** Shown on legal pages, e.g. "22 October 2026". */
  updated?: string;
  children: ReactNode;
}

/** Shared layout for About, FAQ and the legal pages. */
export function ContentPage({ title, intro, updated, children }: ContentPageProps) {
  return (
    <article className="mx-auto max-w-3xl px-4 py-12">
      <header className="mb-8 border-b border-border pb-6">
        <h1 className="text-3xl font-extrabold tracking-tight">{title}</h1>
        {intro && <p className="mt-3 text-lg text-muted">{intro}</p>}
        {updated && <p className="mt-3 text-xs text-muted">Last updated: {updated}</p>}
      </header>
      <div className="space-y-10">{children}</div>
    </article>
  );
}

interface SectionProps {
  id?: string;
  title: string;
  children: ReactNode;
}

export function Section({ id, title, children }: SectionProps) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="mb-3 text-xl font-bold">{title}</h2>
      <div className="space-y-3 leading-relaxed text-foreground/90 [&_a]:text-brand [&_a]:underline [&_ul]:list-disc [&_ul>li]:ml-5 [&_ul]:space-y-1">
        {children}
      </div>
    </section>
  );
}
