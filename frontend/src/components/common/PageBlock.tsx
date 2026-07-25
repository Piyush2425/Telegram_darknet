import type { ReactNode } from 'react';

interface PageBlockProps {
  title: string;
  eyebrow: string;
  description: string;
  children?: ReactNode;
}

export function PageBlock({ title, eyebrow, description, children }: PageBlockProps) {
  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-300/80">{eyebrow}</p>
        <h1 className="page-title">{title}</h1>
        <p className="max-w-3xl text-[13px] leading-6 text-slate-400 lg:text-sm">{description}</p>
      </div>
      {children}
    </section>
  );
}
