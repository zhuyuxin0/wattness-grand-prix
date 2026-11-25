import { Glyph } from "./Glyph";

export type ParcFermeState = "sealed" | "open" | "refused";

interface ParcFermeProps {
  state?: ParcFermeState;
  size?: "sm" | "md";
  /** Replaces the state's own label. */
  label?: string;
  className?: string;
}

// The record's state as a word with its mark: the seal dot for sealed (BNB
// yellow, the one place it appears beside the chain's own record), the drawn
// close for refused, the clock while plans can still be sealed.
const LABEL: Record<ParcFermeState, string> = {
  sealed: "Sealed",
  open: "Open until the gate",
  refused: "Late seal refused",
};

const TITLE: Record<ParcFermeState, string> = {
  sealed: "Sealed on BNB Chain before the 10:00 CT gate. No changes.",
  open: "Plans can still be sealed until 10:00 CT.",
  refused: "A commit after the gate is refused by the contract.",
};

export function ParcFerme({ state = "sealed", size = "md", label, className }: ParcFermeProps) {
  return (
    <span className={`pf pf--${state} pf--${size}${className ? ` ${className}` : ""}`} title={TITLE[state]}>
      <Glyph name={state === "sealed" ? "seal" : state === "refused" ? "close" : "clock"} />
      <span>{label ?? LABEL[state]}</span>
    </span>
  );
}
