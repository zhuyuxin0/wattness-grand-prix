import { Glyph } from "./Glyph";

export type ParcFermeState = "sealed" | "open" | "refused";

interface ParcFermeProps {
  state?: ParcFermeState;
  size?: "sm" | "md";
  /** Replaces the state's own label. */
  label?: string;
  className?: string;
}

const LABEL: Record<ParcFermeState, string> = {
  sealed: "Parc ferme",
  open: "Qualifying",
  refused: "Late seal reverted",
};

const TITLE: Record<ParcFermeState, string> = {
  sealed: "Sealed on BNB Chain before the 10:00 CT gate. No changes.",
  open: "Plans can still be sealed until 10:00 CT.",
  refused: "A commit after the gate is refused by the contract.",
};

export function ParcFerme({ state = "sealed", size = "md", label, className }: ParcFermeProps) {
  return (
    <span className={`pf pf--${state} pf--${size}${className ? ` ${className}` : ""}`} title={TITLE[state]}>
      <Glyph name={state === "sealed" ? "seal" : state === "refused" ? "cross" : "clock"} size={size === "sm" ? 12 : 14} />
      <span>{label ?? LABEL[state]}</span>
    </span>
  );
}
