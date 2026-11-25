import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { SOURCE_LINE } from "../../config";
import { useDay, type BatterySummary, type DayIndex } from "../../data";
import { arm as armMeta, type ArmName } from "../../design/tokens";
import { formatDec1, formatInt, formatUsd } from "../../lib/format";
import { formatOperatingDay } from "../../lib/time";
import { Glyph, Hash, PageHeader, ParcFerme, Ready, nextSort, sortRows, type SortKind, type SortState, type SortValue } from "../../ui";
import { Detail } from "./Detail";
import { Strip } from "./Strip";
import "./styles.css";

// Standings: every sealed plan of the day on one timing screen. Values are
// modeled under each plan's own stated assumptions; settled results are
// linked to the same record later, one hash per settlement stage.

interface Col {
  key: string;
  label: string;
  title?: string;
  kind: SortKind;
  value: (b: BatterySummary) => SortValue;
  className?: string;
}

const expected = (b: BatterySummary) => b.arms[b.selectedArm]?.expectedUsd ?? null;
const objective = (b: BatterySummary) => b.arms[b.selectedArm]?.objectiveUsd ?? null;

const COLS: Col[] = [
  { key: "resource", label: "Battery", kind: "text", value: (b) => b.resource, className: "sd-c-res" },
  { key: "node", label: "Node", kind: "text", value: (b) => b.settlementPoint, className: "sd-c-node" },
  { key: "hub", label: "Hub", kind: "text", value: (b) => b.hub, className: "sd-c-hub" },
  { key: "mw", label: "MW", title: "Rated power", kind: "number", value: (b) => b.powerMw, className: "r" },
  { key: "mwh", label: "MWh", title: "Rated energy", kind: "number", value: (b) => b.energyMwh, className: "r" },
  { key: "plan", label: "Day plan", title: "Selected arm's 24 hourly MW, discharge up, charge down", kind: "number", value: (b) => b.dischargeMwh / Math.max(b.energyMwh, 1e-9), className: "sd-c-plan" },
  { key: "dis", label: "Discharge MWh", title: "Planned discharge over the day, selected arm", kind: "number", value: (b) => b.dischargeMwh, className: "r" },
  { key: "arm", label: "Arm", title: "Selected arm: A no hedge, B hedge on A's schedule, C chosen together", kind: "text", value: (b) => b.selectedArm, className: "c" },
  { key: "ev", label: "Expected $", title: "Expected value of the selected arm under the plan's own scenarios and assumptions", kind: "number", value: expected, className: "r" },
  { key: "obj", label: "Objective $", title: "Expected value minus 0.5 x CVaR(90%) of loss: the selection criterion", kind: "number", value: objective, className: "r sd-c-obj" },
  { key: "leaf", label: "Leaf", kind: "text", value: (b) => b.leaf, className: "sd-c-leaf" },
];

const HUBS = ["HB_HOUSTON", "HB_NORTH", "HB_SOUTH", "HB_WEST"];
const hubLabel = (h: string) => h.replace("HB_", "").replace(/^(.)(.*)$/, (_, a: string, b: string) => a + b.toLowerCase());

function matches(b: BatterySummary, q: string): boolean {
  if (!q) return true;
  return `${b.resource} ${b.settlementPoint} ${b.hub} ${b.zone ?? ""} ${b.county ?? ""}`.toLowerCase().includes(q);
}

export default function StandingsPage() {
  const day = useDay();
  return (
    <div className="page page--standings">
      <Ready state={day}>{(d) => <Standings day={d} />}</Ready>
    </div>
  );
}

function Standings({ day }: { day: DayIndex }) {
  const { "*": splat = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const [hub, setHub] = useState<string | null>(null);
  const [sort, setSort] = useState<SortState | null>({ key: "ev", desc: true });
  // ?b= keeps the page in place when a row opens; #/standings/<resource> deep-links.
  const wanted = params.has("b") ? params.get("b") : splat;
  const open = day.batteries.some((b) => b.resource === wanted) ? wanted : null;
  const tableRef = useRef<HTMLDivElement>(null);

  // A deep link can open a row far down the screen; bring it under the sticky head.
  // A click opens a row that is already in view, so nothing moves then.
  useEffect(() => {
    const wrap = tableRef.current;
    const row = wrap?.querySelector<HTMLElement>(".sd-row.is-open");
    if (!wrap || !row) return;
    const head = wrap.querySelector("thead")?.getBoundingClientRect().height ?? 0;
    const top = row.getBoundingClientRect().top - wrap.getBoundingClientRect().top;
    const detail = row.nextElementSibling?.getBoundingClientRect().height ?? 0;
    if (top < head || top + row.offsetHeight + detail > wrap.clientHeight) wrap.scrollTop += top - head;
  }, [open]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = day.batteries.filter((b) => (!hub || b.hub === hub) && matches(b, q));
    if (!sort) return list;
    const col = COLS.find((c) => c.key === sort.key);
    return col ? sortRows(list, col.value, sort.desc) : list;
  }, [day.batteries, query, hub, sort]);

  const totals = useMemo(() => {
    const t = { mw: 0, mwh: 0, dis: 0, ev: 0, obj: 0, arms: { A: 0, B: 0, C: 0 } as Record<ArmName, number> };
    for (const b of rows) {
      t.mw += b.powerMw;
      t.mwh += b.energyMwh;
      t.dis += b.dischargeMwh;
      t.ev += expected(b) ?? 0;
      t.obj += objective(b) ?? 0;
      t.arms[b.selectedArm] += 1;
    }
    return t;
  }, [rows]);

  const filtered = rows.length !== day.batteries.length;
  const toggle = (r: string) => {
    const next = new URLSearchParams(params);
    if (open === r) {
      if (splat) next.set("b", "");
      else next.delete("b");
    }
    else next.set("b", r);
    setParams(next, { replace: true });
  };

  return (
    <>
      <PageHeader
        kicker="Standings"
        title="The starting grid, sealed"
        lede={`Every ERCOT battery planned for ${formatOperatingDay(day.operatingDay)} under the same rules, from the same public data, each plan sealed as one leaf of the day's root before the gate.`}
        aside={
          <div className="sd-aside">
            <ParcFerme state="sealed" />
            <span className="sd-aside__count num">
              {formatInt(day.leafCount)}
              <span>plans</span>
            </span>
          </div>
        }
      />

      <section className="sd-board" aria-label="Standings">
        <div className="sd-scope">
          <p>
            <b>Modeled under each plan's stated assumptions.</b> Expected and objective values come from the plan's own price scenarios for a price-taking, energy-only day-ahead schedule at the battery's settlement point; hedges use ElectronX's published hourly bounded-future terms at an assumed fair-value entry. GateRecord links settled results to the same record as outcomes, one hash per settlement stage.
          </p>
        </div>

        <div className="sd-controls">
          <label className="sd-search">
            <span className="visually-hidden">Search batteries</span>
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
              <path d="M7 12.5a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11ZM11 11l3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <input type="search" value={query} placeholder="Battery, node, hub or county" spellCheck={false} autoComplete="off" onChange={(e) => setQuery(e.target.value)} />
          </label>
          <div className="sd-seg" role="radiogroup" aria-label="Hub">
            {[null, ...HUBS].map((h) => (
              <button key={h ?? "all"} type="button" role="radio" aria-checked={hub === h} className={`sd-seg__opt${hub === h ? " is-on" : ""}`} onClick={() => setHub(h)}>
                {h ? hubLabel(h) : "All hubs"}
              </button>
            ))}
          </div>
          <span className="sd-controls__count num">
            {filtered ? `${formatInt(rows.length)} of ${formatInt(day.batteries.length)}` : `${formatInt(rows.length)} batteries`}
          </span>
        </div>

        <div ref={tableRef} className="sd-table" role="region" aria-label="Sealed plans" tabIndex={0}>
          <table>
            <thead>
              <tr>
                <th scope="col" className="sd-c-pos">
                  <span className="visually-hidden">Position</span>
                  <span aria-hidden="true">P</span>
                </th>
                {COLS.map((c) => {
                  const active = sort?.key === c.key;
                  return (
                    <th key={c.key} scope="col" className={`${c.className ?? ""}${active ? " is-sorted" : ""}`} aria-sort={active ? (sort.desc ? "descending" : "ascending") : undefined}>
                      <button type="button" className="sd-sort" title={c.title} onClick={() => setSort(nextSort(sort, c.key, c.kind))}>
                        <span>{c.label}</span>
                        <Glyph name={active ? (sort.desc ? "sort-down" : "sort-up") : "dash"} size={11} className="sd-sort__glyph" />
                      </button>
                    </th>
                  );
                })}
              </tr>
              <tr className="sd-totals">
                <th scope="row" className="sd-c-pos">
                  <span className="visually-hidden">Totals</span>
                </th>
                {/* One cell per column, not a span: phones hide the node column. */}
                <th scope="row" className="sd-c-res sd-totals__head">
                  <span className="sd-totals__label">{filtered ? "Selection" : "Fleet"}</span>
                  <span className="sd-totals__n num">{formatInt(rows.length)} plans</span>
                </th>
                <td className="sd-c-node" />
                <td className="sd-c-hub" />
                <td className="r num">{formatInt(Math.round(totals.mw))}</td>
                <td className="r num">{formatInt(Math.round(totals.mwh))}</td>
                <td className="sd-c-plan" />
                <td className="r num">{formatInt(Math.round(totals.dis))}</td>
                <td className="c">
                  <span className="sd-totals__arms num">
                    {(["C", "B", "A"] as ArmName[])
                      .filter((a) => totals.arms[a] > 0)
                      .map((a) => (
                        <span key={a}>
                          <b style={{ color: armMeta[a].color }}>{a}</b>
                          {totals.arms[a]}
                        </span>
                      ))}
                  </span>
                </td>
                <td className="r num">{formatUsd(totals.ev, { whole: true })}</td>
                <td className="r num sd-c-obj">{formatUsd(totals.obj, { whole: true })}</td>
                <td className="sd-c-leaf">
                  <Hash value={day.root} head={4} tail={4} label="day's root" className="sd-root" />
                </td>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={COLS.length + 1} className="sd-empty">
                    No battery matches “{query}”.
                  </td>
                </tr>
              )}
              {rows.map((b, i) => {
                const isOpen = open === b.resource;
                const ev = expected(b);
                return (
                  <Fragment key={b.resource}>
                    <tr
                      className={`sd-row${isOpen ? " is-open" : ""}${b.resource === day.showcase ? " is-showcase" : ""}`}
                      tabIndex={0}
                      aria-expanded={isOpen}
                      onClick={() => toggle(b.resource)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          toggle(b.resource);
                        }
                      }}
                    >
                      <td className="sd-c-pos num">{i + 1}</td>
                      <td className="sd-c-res">
                        <span className="sd-res">{b.resource}</span>
                        {b.county && <span className="sd-county">{b.county}</span>}
                      </td>
                      <td className="sd-c-node">{b.settlementPoint}</td>
                      <td className="sd-c-hub">{hubLabel(b.hub)}</td>
                      <td className="r num">{formatDec1(b.powerMw)}</td>
                      <td className="r num">{formatDec1(b.energyMwh)}</td>
                      <td className="sd-c-plan">
                        <Strip scheduleMw={b.scheduleMw} powerMw={b.powerMw} />
                      </td>
                      <td className="r num">{formatDec1(b.dischargeMwh)}</td>
                      <td className="c">
                        <span className={`sd-armtag sd-armtag--${b.selectedArm}`}>{b.selectedArm}</span>
                      </td>
                      <td className={`r num sd-ev${ev !== null && ev < 0 ? " is-neg" : ""}`}>{formatUsd(ev, { whole: true })}</td>
                      <td className="r num sd-c-obj">{formatUsd(objective(b), { whole: true })}</td>
                      <td className="sd-c-leaf" onClick={(e) => e.stopPropagation()}>
                        <Hash value={b.leaf} head={4} tail={4} label={`${b.resource} leaf hash`} />
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="sd-open">
                        <td colSpan={COLS.length + 1}>
                          <Detail b={b} onClose={() => toggle(b.resource)} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="sd-source">
          {SOURCE_LINE} Hedge terms: ElectronX's published product specifications. {day.leafCount} plans for operating day {day.operatingDay}, {day.market} {day.regime}; inputs from Wattness Terminal release {day.inputsRelease}.
        </p>
      </section>

      {day.exclusions.length > 0 && (
        <section className="sd-excl" aria-label="Not on the grid">
          <div className="eyebrow">Not on the grid</div>
          <p>
            The grid is every battery whose ERCOT census row gives a rated power, a rated energy and a settlement point. The day's index names the other {day.exclusions.length} with the field that kept each one off.
          </p>
        </section>
      )}
    </>
  );
}
