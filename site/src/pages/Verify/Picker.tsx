import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { BatterySummary } from "../../data";
import { Glyph } from "../../ui";

interface PickerProps {
  batteries: readonly BatterySummary[];
  value: string;
  onPick: (resource: string) => void;
  showcase: string;
}

const MAX = 8;

function score(b: BatterySummary, q: string): number {
  if (!q) return b.index;
  const r = b.resource.toLowerCase();
  if (r === q) return -3;
  if (r.startsWith(q)) return -2;
  if (b.settlementPoint.toLowerCase().startsWith(q)) return -1;
  const hay = `${r} ${b.settlementPoint} ${b.hub} ${b.zone ?? ""} ${b.county ?? ""}`.toLowerCase();
  return hay.includes(q) ? b.index : Infinity;
}

/** A searchable list of the day's batteries; the showcase first when empty. */
export function Picker({ batteries, value, onPick, showcase }: PickerProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const ranked = batteries
      .map((b) => ({ b, s: !q && b.resource === showcase ? -10 : score(b, q) }))
      .filter((x) => x.s !== Infinity)
      .sort((x, y) => x.s - y.s);
    return ranked.slice(0, MAX).map((x) => x.b);
  }, [batteries, query, showcase]);

  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open]);

  const pick = (r: string) => {
    setOpen(false);
    setQuery("");
    input.current?.blur();
    onPick(r);
  };

  const current = batteries.find((b) => b.resource === value);

  return (
    <div className={`st-picker${open ? " is-open" : ""}`} ref={box}>
      <label className="st-picker__label" htmlFor={`${listId}-input`}>
        Battery
      </label>
      <div className="st-picker__field">
        <input
          ref={input}
          id={`${listId}-input`}
          className="st-picker__input"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && matches[active] ? `${listId}-${matches[active].resource}` : undefined}
          autoComplete="off"
          spellCheck={false}
          placeholder={current ? current.resource : "Search 316 batteries"}
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
              setActive((a) => Math.min(a + 1, matches.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter") {
              const m = matches[active];
              if (m) {
                e.preventDefault();
                pick(m.resource);
              }
            } else if (e.key === "Escape") {
              setOpen(false);
              setQuery("");
            }
          }}
        />
        <Glyph name="chevron-down" size={14} className="st-picker__chev" />
      </div>
      {open && (
        <ul className="st-picker__list" id={listId} role="listbox">
          {matches.length === 0 && <li className="st-picker__empty">No battery matches</li>}
          {matches.map((b, i) => (
            <li
              key={b.resource}
              id={`${listId}-${b.resource}`}
              role="option"
              aria-selected={b.resource === value}
              className={`st-picker__opt${i === active ? " is-active" : ""}${b.resource === value ? " is-current" : ""}`}
              onPointerEnter={() => setActive(i)}
              onPointerDown={(e) => {
                e.preventDefault();
                pick(b.resource);
              }}
            >
              <span className="st-picker__res">{b.resource}</span>
              <span className="st-picker__meta">
                {b.settlementPoint} · {b.hub}
              </span>
              <span className="st-picker__size num">{b.powerMw.toLocaleString("en-US", { maximumFractionDigits: 1 })} MW</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
