interface SkeletonBlockProps {
  rows?: number;
  className?: string;
}

export function SkeletonBlock({ rows = 4, className = '' }: SkeletonBlockProps) {
  return (
    <div className={`space-y-3 ${className}`} aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="skeleton h-[52px] w-full"
          style={{ opacity: 1 - i * 0.12 }}
        />
      ))}
    </div>
  );
}
