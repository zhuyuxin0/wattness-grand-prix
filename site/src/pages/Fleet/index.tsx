import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { SOURCE_LINE } from "../../config";
import { useDay, type BatterySummary, type DayIndex } from "../../data";
import { arm as armMeta, type ArmName } from "../../design/tokens";
import { formatDec1, formatInt, formatUsd } from "../../lib/format";
import { formatOperatingDay } from "../../lib/time";
import { Glyph, Hash, PageHeader, ParcFerme, Ready, Section, Stat, StatRow, nextSort, sortRows, type SortKind, type SortState, type SortValue } from "../../ui";
import { Detail } from "./Detail";
import { MISSING_FIELD, hubLabel, plainName } from "./names";
import { Strip } from "./Strip";
import "./styles.css";

// Fleet: every sealed plan of the day in one table, with the fleet's totals,
// a search, a hub filter and the Terminal's three-click sort. A row opens the
// plan's schedule and its three plans; Battery reads one plan in full.

interface Col {
  key: string;
  label: ReactNode;
  title: string;
  kind: SortKind;
  value: (b: BatterySummary) => SortValue;
  className?: string;
}

const expected = (b: BatterySummary) => b.arms[b.selectedArm]?.expectedUsd ?? null;
const objective = (b: BatterySummary) => b.arms[b.selectedArm]?.objectiveUsd ?? null;
const unit = (u: string) => <span className="fl-unit">{u}</span>;

const COLS: Col[] = [
  { key: "resource", label: "Battery", title: "ERCOT resource, with its county", kind: "text", value: (b) => plainName(b.resource) ?? b.resource, className: "fl-c-bat" },
  { key: "hub", label: "Hub", title: "ERCOT trading hub", kind: "text", value: (b) => b.hub, className: "fl-c-hub fl-wide" },
  { key: "mw", label: <>Power {unit("MW")}</>, title: "Rated power", kind: "number", value: (b) => b.powerMw, className: "r fl-wide" },
  { key: "mwh", label: <>Energy {unit("MWh")}</>, title: "Rated energy", kind: "number", value: (b) => b.energyMwh, className: "r fl-wide" },
  {
    key: "plan",
    label: "Day plan",
    title: "The chosen plan's 24 hourly MW, discharge above the line and charge below, scaled to the battery's rating; sorts by the day's discharge over the rated energy",
    kind: "number",
    value: (b) => b.dischargeMwh / Math.max(b.energyMwh, 1e-9),
    className: "fl-c-strip fl-wide",
  },
  { key: "dis", label: <>Discharge {unit("MWh")}</>, title: "Planned discharge over the day, chosen plan", kind: "number", value: (b) => b.dischargeMwh, className: "r fl-wide" },
  { key: "arm", label: "Plan", title: "The sealed plan: A no hedge, B a hedge on a fixed schedule, C schedule and hedge chosen together", kind: "text", value: (b) => b.selectedArm, className: "fl-c-arm" },
  { key: "ev", label: <>Expected {unit("$")}</>, title: "The sealed plan's mean value over its own price scenarios", kind: "number", value: expected, className: "r" },
  { key: "obj", label: <>Objective {unit("$")}</>, title: "Expected value minus half the CVaR (90%) of the day's loss: what chooses the plan", kind: "number", value: objective, className: "r fl-wide" },
];

const HUBS = ["HB_HOUSTON", "HB_NORTH", "HB_SOUTH", "HB_WEST"];

function matches(b: BatterySummary, q: string): boolean {
  if (!q) return true;
  const hay = `${b.resource} ${plainName(b.resource) ?? ""} ${b.settlementPoint} ${b.hub} ${hubLabel(b.hub)} ${b.zone ?? ""} ${b.county ?? ""}`.toLowerCase();
  return q.split(/\s+/).every((t) => hay.includes(t));
}

export default function FleetPage() {
  const day = useDay();
  return (
    <div className="page page--fleet">
      <Ready state={day}>{(d) => <Fleet day={d} />}</Ready>
    </div>
  );
}

function Fleet({ day }: { day: DayIndex }) {
  const { "*": splat = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const [hub, setHub] = useState<string | null>(null);
  const [sort, setSort] = useState<SortState | null>({ key: "ev", desc: true });
  // ?b= keeps the page in place when a row opens; #/fleet/<resource> deep-links one.
  const wanted = params.has("b") ? params.get("b") : splat;
  const open = day.batteries.some((b) => b.resource === wanted) ? wanted : null;
  const tableRef = useRef<HTMLTableElement>(null);
  const deepLinked = useRef(open !== null && !params.has("b"));

  // A shared link opens a row far down the table: bring it into view once.
  useEffect(() => {
    if (!deepLinked.current) return;
    deepLinked.current = false;
    tableRef.current?.querySelector<HTMLElement>(".fl-row.is-open")?.scrollIntoView({ block: "center" });
  }, []);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = day.batteries.filter((b) => (!hub || b.hub === hub) && matches(b, q));
    if (!sort) return list;
    const col = COLS.find((c) => c.key === sort.key);
    return col ? sortRows(list, col.value, sort.desc) : list;
  }, [day.batteries, query, hub, sort]);

  const sum = (list: readonly BatterySummary[]) => {
    const t = { mw: 0, mwh: 0, dis: 0, ev: 0, obj: 0, arms: { A: 0, B: 0, C: 0 } as Record<ArmName, number> };
    for (const b of list) {
      t.mw += b.powerMw;
      t.mwh += b.energyMwh;
      t.dis += b.dischargeMwh;
      t.ev += expected(b) ?? 0;
      t.obj += objective(b) ?? 0;
      t.arms[b.selectedArm] += 1;
    }
    return t;
  };
  const fleet = useMemo(() => sum(day.batteries), [day.batteries]);
  const shown = useMemo(() => sum(rows), [rows]);

  const filtered = rows.length !== day.batteries.length;
  const toggle = (r: string) => {
    const next = new URLSearchParams(params);
    if (open === r) {
      if (splat) next.set("b", "");
      else next.delete("b");
    } else next.set("b", r);
    setParams(next, { replace: true });
  };

  const opDay = formatOperatingDay(day.operatingDay);
  const byField = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const e of day.exclusions) {
      const field = e.reason.split(": ").pop() ?? e.reason;
      m.set(field, [...(m.get(field) ?? []), e.resource]);
    }
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [day.exclusions]);

  return (
    <>
      <PageHeader
        title="Fleet"
        lede={`All ${formatInt(day.leafCount)} sealed plans for ${opDay}: every ERCOT battery's plan, made under the same rules from the same public data and sealed before the gate. Open a row for one plan's schedule.`}
        aside={
          <div className="fl-aside">
            <ParcFerme state="sealed" label="Sealed in one root" />
            <Hash value={day.root} head={6} tail={4} label="day's root" />
          </div>
        }
      />

      <section className="fl-lead" aria-label="The fleet's day">
        <StatRow className="fl-stats">
          <Stat label="Plans sealed" value={formatInt(day.leafCount)} note={`${formatInt(day.exclusions.length)} more in ERCOT's census lack a field a plan needs`} />
          <Stat label="Rated power" value={formatInt(Math.round(fleet.mw))} unit="MW" note={`sum over the ${formatInt(day.leafCount)}`} />
          <Stat label="Rated energy" value={formatInt(Math.round(fleet.mwh))} unit="MWh" note={`sum over the ${formatInt(day.leafCount)}`} />
          <Stat label="Planned discharge" value={formatInt(Math.round(fleet.dis))} unit="MWh" note="sealed plans, the whole day" />
          <Stat label="Expected value" value={formatUsd(fleet.ev, { whole: true })} note="sealed plans, modeled" />
          <Stat
            label="Plan sealed"
            value={
              <span className="fl-mix">
                {(["C", "B", "A"] as ArmName[])
                  .filter((a) => fleet.arms[a] > 0)
                  .map((a) => (
                    <span key={a} title={armMeta[a].label}>
                      <i className="fl-swatch" style={{ background: armMeta[a].color }} aria-hidden="true" />
                      {a} {fleet.arms[a]}
                    </span>
                  ))}
              </span>
            }
            note={(() => {
              // The key to the letters shown, then any plan no battery sealed, said once in words.
              const order = ["C", "B", "A"] as ArmName[];
              const shown = order.filter((a) => fleet.arms[a] > 0).map((a) => `${a} ${armMeta[a].label.toLowerCase()}`);
              const none = order.filter((a) => fleet.arms[a] === 0).map((a) => `${a} (${armMeta[a].label.toLowerCase()})`);
              return `${shown.join(" · ")}${none.length ? `; no battery sealed ${none.join(" or ")}` : ""}`;
            })()}
          />
        </StatRow>
        <p className="fl-source">
          Operating day {opDay} ({day.market}, {day.regime}). Expected value is each sealed plan's mean over its own price scenarios, for a price-taking, energy-only
          day-ahead schedule at the battery's settlement point. {SOURCE_LINE}
        </p>
      </section>

      <Section
        id="fl-plans"
        title="Every Plan"
        actions={
          <div className="fl-controls">
            <label className="fl-search">
              <span className="visually-hidden">Search batteries</span>
              <input type="search" value={query} placeholder="Battery, node, hub or county" spellCheck={false} autoComplete="off" onChange={(e) => setQuery(e.target.value)} />
            </label>
            <div className="seg" role="group" aria-label="Hub">
              {[null, ...HUBS].map((h) => (
                <button key={h ?? "all"} type="button" aria-pressed={hub === h} onClick={() => setHub(h)}>
                  {h ? hubLabel(h) : "All hubs"}
                </button>
              ))}
            </div>
          </div>
        }
        source={
          <>
            {SOURCE_LINE} Hedge terms: ElectronX's published product specifications, at an assumed fair-value entry. {formatInt(day.leafCount)} plans for operating day {opDay}; inputs
            from Wattness Terminal release <code>{day.inputsRelease}</code>.
          </>
        }
      >
        <div className="fl-table" role="region" aria-label="Sealed plans">
          <table ref={tableRef}>
            <thead>
              <tr>
                <th scope="col" className="fl-c-pos" title="Position in the current order">
                  #
                </th>
                {COLS.map((c) => {
                  const active = sort?.key === c.key;
                  return (
                    <th key={c.key} scope="col" className={`${c.className ?? ""}${active ? " is-sorted" : ""}`} aria-sort={active ? (sort.desc ? "descending" : "ascending") : undefined}>
                      <button type="button" className="fl-sort" title={c.title} onClick={() => setSort(nextSort(sort, c.key, c.kind))}>
                        {c.kind === "number" && <Glyph name={active ? (sort.desc ? "sort-down" : "sort-up") : "dash"} size={11} className="fl-sort__glyph" />}
                        <span>{c.label}</span>
                        {c.kind !== "number" && <Glyph name={active ? (sort.desc ? "sort-down" : "sort-up") : "dash"} size={11} className="fl-sort__glyph" />}
                      </button>
                    </th>
                  );
                })}
              </tr>
              <tr className="fl-total">
                <th scope="row" className="fl-c-pos">
                  <span className="visually-hidden">Totals</span>
                </th>
                <th scope="row" className="fl-c-bat">
                  {filtered ? `${formatInt(rows.length)} of ${formatInt(day.batteries.length)} plans` : `All ${formatInt(rows.length)} plans`}
                </th>
                <td className="fl-c-hub fl-wide" />
                <td className="r num fl-wide">{formatInt(Math.round(shown.mw))}</td>
                <td className="r num fl-wide">{formatInt(Math.round(shown.mwh))}</td>
                <td className="fl-c-strip fl-wide" />
                <td className="r num fl-wide">{formatInt(Math.round(shown.dis))}</td>
                <td className="fl-c-arm">
                  <span className="fl-mix fl-mix--sm num">
                    {(["C", "B", "A"] as ArmName[])
                      .filter((a) => shown.arms[a] > 0)
                      .map((a) => (
                        <span key={a}>
                          {a} {shown.arms[a]}
                        </span>
                      ))}
                  </span>
                </td>
                <td className="r num">{formatUsd(shown.ev, { whole: true })}</td>
                <td className="r num fl-wide">{formatUsd(shown.obj, { whole: true })}</td>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={COLS.length + 1} className="fl-empty">
                    No battery matches “{query}”{hub ? ` in the ${hubLabel(hub)} hub` : ""}.
                  </td>
                </tr>
              )}
              {rows.map((b, i) => {
                const isOpen = open === b.resource;
                const name = plainName(b.resource);
                return (
                  <Fragment key={b.resource}>
                    <tr
                      className={`fl-row${isOpen ? " is-open" : ""}`}
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
                      <td className="fl-c-pos num">{i + 1}</td>
                      <td className="fl-c-bat">
                        <span className="fl-bat">
                          {name ? (
                            <>
                              <span className="fl-name">{name}</span>
                              <span className="fl-code fl-code--sub">({b.resource})</span>
                            </>
                          ) : (
                            <span className="fl-code">{b.resource}</span>
                          )}
                          {b.county && <span className="fl-county">{b.county}</span>}
                        </span>
                      </td>
                      <td className="fl-c-hub fl-wide">{hubLabel(b.hub)}</td>
                      <td className="r num fl-wide">{formatDec1(b.powerMw)}</td>
                      <td className="r num fl-wide">{formatDec1(b.energyMwh)}</td>
                      <td className="fl-c-strip fl-wide">
                        <Strip scheduleMw={b.scheduleMw} powerMw={b.powerMw} />
                      </td>
                      <td className="r num fl-wide">{formatDec1(b.dischargeMwh)}</td>
                      <td className="fl-c-arm">
                        <span className="fl-plan" title={armMeta[b.selectedArm].label}>
                          <i className="fl-swatch" style={{ background: armMeta[b.selectedArm].color }} aria-hidden="true" />
                          {b.selectedArm}
                        </span>
                      </td>
                      <td className="r num">{formatUsd(expected(b), { whole: true })}</td>
                      <td className="r num fl-wide">{formatUsd(objective(b), { whole: true })}</td>
                    </tr>
                    {isOpen && (
                      <tr className="fl-open">
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
      </Section>

      {day.exclusions.length > 0 && (
        <Section
          id="fl-left-out"
          title="Batteries Without a Plan"
          lede={`${formatInt(day.exclusions.length)} more batteries are in ERCOT's census, but their census row lacks a field a plan needs, so none was made for them.`}
          source={`The day's index names each one with the field it lacks. ${SOURCE_LINE}`}
        >
          <dl className="fl-out">
            {byField.map(([field, list]) => (
              <div key={field}>
                <dt>
                  {MISSING_FIELD[field] ?? field} <span className="muted">({field})</span>
                  <span className="fl-out__n num">{list.length}</span>
                </dt>
                <dd>
                  {list.map((r) => (
                    <span key={r} className="fl-code">
                      {r}
                    </span>
                  ))}
                </dd>
              </div>
            ))}
          </dl>
        </Section>
      )}
    </>
  );
}
