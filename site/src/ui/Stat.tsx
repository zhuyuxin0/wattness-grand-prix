import type { ReactNode } from "react";

interface StatProps {
  label: string;
  value: ReactNode;
  unit?: string;
  /** Scope and source of the figure: what it covers and where it comes from. */
  note?: ReactNode;
  tone?: "default" | "teal" | "sealed" | "refused";
  size?: "sm" | "md" | "lg";
  /** Timing-screen digits (condensed, tabular). */
  timing?: boolean;
  className?: string;
}

export function Stat({ label, value, unit, note, tone = "default", size = "md", timing = false, className }: StatProps) {
  return (
    <div className={`stat stat--${size} stat--${tone}${timing ? " stat--timing" : ""}${className ? ` ${className}` : ""}`}>
      <div className="stat__label">{label}</div>
      <div className="stat__value num">
        {value}
        {unit && <span className="stat__unit">{unit}</span>}
      </div>
      {note && <div className="stat__note">{note}</div>}
    </div>
  );
}

export function StatRow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={`stat-row${className ? ` ${className}` : ""}`}>{children}</div>;
}
