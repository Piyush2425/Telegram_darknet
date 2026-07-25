import type { ReactNode } from 'react';

interface MetricCardProps {
  title: string;
  subtitle: string;
  value: string;
  icon: ReactNode;
  trend: number[];
  tone?: 'cyan' | 'emerald' | 'amber' | 'rose';
}

const toneClasses: Record<NonNullable<MetricCardProps['tone']>, string> = {
  cyan: 'text-cyan-200 bg-cyan-400/10',
  emerald: 'text-emerald-200 bg-emerald-400/10',
  amber: 'text-amber-200 bg-amber-400/10',
  rose: 'text-rose-200 bg-rose-400/10',
};

export function MetricCard({ title, subtitle, value, icon, trend, tone = 'cyan' }: MetricCardProps) {
  const max = Math.max(...trend, 1);
  const points = trend
    .map((point, index) => {
      const x = trend.length === 1 ? 50 : (index / (trend.length - 1)) * 100;
      const y = 100 - (point / max) * 80 - 10;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <article className="glass-panel rounded-[16px] p-4 transition hover:-translate-y-0.5 hover:border-cyan-400/30 lg:p-5">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className={`rounded-2xl p-2.5 ${toneClasses[tone]}`}>{icon}</div>
        <span className="h-2 w-2 rounded-full bg-emerald-400" aria-hidden="true" />
      </div>

      <p className="metric-subtitle">{subtitle}</p>
      <div className="mt-2 flex items-end justify-between gap-3">
        <div>
          <h2 className="text-[14px] font-medium text-slate-200 lg:text-[15px]">{title}</h2>
          <p className="metric-value mt-2">{value}</p>
        </div>

        <svg viewBox="0 0 100 100" className="h-10 w-20 shrink-0 text-cyan-300 lg:h-12 lg:w-24" aria-hidden="true">
          <polyline
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={points}
          />
        </svg>
      </div>
    </article>
  );
}
