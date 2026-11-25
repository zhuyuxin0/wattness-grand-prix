import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { BatterySummary } from "../data";
import { formatDec1 } from "../lib/format";
import { Glyph } from "./Glyph";
import "./battery-picker.css";

const SHOWN = 60;

interface Props {
  batteries: BatterySummary[];
  value: string;
  /** Plain names for the few batteries that have one. */
  names: Record<string, string>;
  onChange: (resource: string) => void;
}

function matches(b: BatterySummary, names: Record<string, string>, q: string) {
  if (!q) return true;
  const hay = `${b.resource} ${b.settlementPoint} ${b.hub} ${b.zone ?? ""} ${b.county ?? ""} ${names[b.resource] ?? ""}`.toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((t) => hay.includes(t));
}

/** A searchable list of every battery in the sealed root: the Battery and agent tabs share it. */
export function BatteryPicker({ batteries, value, names, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const id = useId();

  const current = batteries.find((b) => b.resource === value);
  const found = useMemo(() => batteries.filter((b) => matches(b, names, query.trim())), [batteries, names, query]);
  const shown = found.slice(0, SHOWN);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  useEffect(() => setCursor(0), [query]);

  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-i="${cursor}"]`)?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  const choose = (r: string) => {
    onChange(r);
    setOpen(false);
    setQuery("");
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(shown.length - 1, c + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(0, c - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const b = shown[cursor];
      if (b) choose(b.resource);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className={`battery-picker${open ? " is-open" : ""}`} ref={root}>
      <span className="battery-picker__label" id={`${id}-label`}>
        Battery
      </span>
      <button type="button" className="battery-picker__button" aria-haspopup="listbox" aria-expanded={open} aria-labelledby={`${id}-label ${id}-value`} onClick={() => setOpen((o) => !o)}>
        <span id={`${id}-value`} className="battery-picker__value">
          {names[value] && <span className="battery-picker__name">{names[value]}</span>}
          <span className="battery-picker__code">{value}</span>
        </span>
        {current && <span className="battery-picker__meta">{current.hub}</span>}
        <Glyph name="caret" />
      </button>
      {open && (
        <div className="battery-picker__pop">
          <div className="battery-picker__search">
            <input
              ref={input}
              type="search"
              value={query}
              placeholder={`Search ${batteries.length} batteries: resource, node, hub, county`}
              aria-label="Search batteries"
              role="combobox"
              aria-expanded="true"
              aria-controls={`${id}-list`}
              aria-activedescendant={shown[cursor] ? `${id}-${shown[cursor]!.resource}` : undefined}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKey}
            />
          </div>
          <ul className="battery-picker__list" role="listbox" id={`${id}-list`} ref={list} aria-label="Batteries">
            {shown.map((b, i) => (
              <li
                key={b.resource}
                id={`${id}-${b.resource}`}
                role="option"
                data-i={i}
                aria-selected={b.resource === value}
                className={`${i === cursor ? "is-cursor" : ""}${b.resource === value ? " is-current" : ""}`}
                onPointerEnter={() => setCursor(i)}
                onClick={() => choose(b.resource)}
              >
                <span className="battery-picker__row-main">
                  <span className="battery-picker__code">{b.resource}</span>
                  {names[b.resource] && <span className="battery-picker__name">{names[b.resource]}</span>}
                </span>
                <span className="battery-picker__row-meta num">
                  {b.settlementPoint} · {b.hub} · {formatDec1(b.powerMw)} MW / {formatDec1(b.energyMwh)} MWh
                </span>
                <span className="battery-picker__arm" title={`Arm ${b.selectedArm} sealed`}>
                  {b.selectedArm}
                </span>
              </li>
            ))}
          </ul>
          <div className="battery-picker__foot num">
            {found.length > SHOWN ? `${SHOWN} of ${found.length} shown; type to narrow` : `${found.length} of ${batteries.length} batteries`}
          </div>
        </div>
      )}
    </div>
  );
}
