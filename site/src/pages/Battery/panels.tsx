import type { ReactNode } from "react";
import type { ArmName } from "../../data";
import type { Desk, DeskCommon } from "../../data/plan";
import { dualTime } from "../../lib/time";
import { Glyph, Hash, Stat, StatRow } from "../../ui";
import {
  count,
  Fact,
  Facts,
  HOURS,
  hourEnding,
  hourRange,
  hourStart,
  money,
  mw1,
  num2,
  pct1,
  perMwh,
  planLabel,
  PlanName,
  planStyle,
  ppmPct,
  Readout,
  TabLink,
  useHour,
  useNarrow,
  usdMwh,
} from "./kit";
import { ARM_ORDER, scoreFormula, startSocMwh, tailPercent, type ArmFigures } from "./model";

// ---------------------------------------------------------------- the lead

/** The sealed plan at a glance: what was sealed, its expected revenue, and the figures the rule weighed. */
export function Lead({ common, fig }: { common: DeskCommon; fig: ArmFigures }) {
  const tail = tailPercent(common);
  const budget = common.assumptions.collateral_budget_cents / 100;
  return (
    <section className="pk-lead bt-lead" aria-label="The sealed plan">
      <div className="pk-lead__line">
        <span className="pk-lead__state">
          <Glyph name="seal" />
          Sealed
        </span>
        <PlanName plan={fig.name} />
      </div>
      <div className="pk-lead__figure">
        <div className="pk-lead__value num">{money(fig.arm.expectedUsd)}</div>
        <p className="pk-lead__caption">
          Expected revenue over the operating day, the mean over {common.scenarios.count} equally weighted price scenarios.
        </p>
      </div>
      <StatRow className="bt-lead__stats">
        <Stat label={`Worst ${tail}% of scenarios`} value={money(fig.tailUsd)} note="mean revenue across them" />
        <Stat label="Score" value={money(fig.arm.objectiveUsd)} note={`${scoreFormula(common)}; the highest is sealed`} />
        <Stat label="Discharged" value={mw1(fig.dischargeMwh)} unit="MWh" note={`${num2(fig.cycles)} cycles, ends at ${pct1(fig.endSocShare)}`} />
        <Stat
          label="Hedge"
          value={count(fig.contracts)}
          unit="contracts"
          note={fig.contracts ? `${money(fig.arm.collateralUsd)} collateral, ${pct1(fig.arm.collateralUsd / budget)} of budget` : "no contracts"}
        />
      </StatRow>
    </section>
  );
}

// ---------------------------------------------------------------- readout

export function HourReadout({ desk, common, fig }: { desk: Desk; common: DeskCommon; fig: ArmFigures }) {
  const { hour } = useHour();
  const e = desk.energyKwh / 1000;
  const plan = { kind: "bar" as const, plan: `var(--arm-${fig.name.toLowerCase()})` };
  if (hour === null) {
    return (
      <Readout
        when="Whole day"
        hint={`Plan ${fig.name}. Tap or point at a chart, or use the arrow keys on it, for one hour.`}
        values={[
          { key: "fc", label: "Node forecast", value: usdMwh(desk.nodeForecastCents.reduce((s, v) => s + v, 0) / HOURS), unit: "/MWh", sub: "mean of the 24 hours", mark: { kind: "line" } },
          { key: "mw", label: "Discharged", value: mw1(fig.dischargeMwh), unit: "MWh", sub: `charged ${mw1(fig.chargeMwh)} MWh`, mark: plan },
          { key: "soc", label: "Ends at", value: mw1(fig.endSocMwh), unit: "MWh", sub: `${pct1(fig.endSocShare)} of energy`, mark: { kind: "line", plan: plan.plan } },
          { key: "q", label: "Contracts", value: count(fig.contracts), sub: fig.contracts ? `in ${fig.hedgedHours} ${fig.hedgedHours === 1 ? "hour" : "hours"}` : "no hedge", mark: plan },
        ]}
      />
    );
  }
  const kw = fig.arm.kw[hour] ?? 0;
  const soc = fig.socMwh[hour] ?? 0;
  const q = fig.arm.contracts[hour] ?? 0;
  const band = desk.nodeScenarioCents;
  const entry = common.entryCents[desk.hub]?.[hour];
  return (
    <Readout
      when={hourRange(hour)}
      hint={`${hourEnding(hour)}, plan ${fig.name}`}
      values={[
        {
          key: "fc",
          label: "Node forecast",
          value: usdMwh(desk.nodeForecastCents[hour] ?? 0),
          unit: "/MWh",
          sub: band ? `5–95%: ${usdMwh(band.p05[hour]!)} to ${usdMwh(band.p95[hour]!)}` : undefined,
          mark: { kind: "line" },
        },
        { key: "mw", label: kw > 0 ? "Discharge" : kw < 0 ? "Charge" : "Power", value: kw === 0 ? "Idle" : mw1(Math.abs(kw) / 1000), unit: kw === 0 ? "" : "MW", mark: plan },
        { key: "soc", label: "State of charge", value: mw1(soc), unit: "MWh", sub: `${pct1(soc / e)} of energy, end of hour`, mark: { kind: "line", plan: plan.plan } },
        {
          key: "q",
          label: q > 0 ? "Contracts sold" : q < 0 ? "Contracts bought" : "Contracts",
          value: q === 0 ? "None" : count(Math.abs(q)),
          sub: entry !== undefined ? `entry ${usdMwh(entry)}/MWh, assumed` : undefined,
          mark: plan,
        },
      ]}
    />
  );
}

// ---------------------------------------------------------------- the plans compared

interface Line {
  label: string;
  note?: string;
  sub?: boolean;
  strong?: boolean;
  value: (f: ArmFigures) => string;
}

/** The three plans side by side, one column each; choosing a column shows that plan above. */
export function Compare({ common, figs, active, sealed, onPick }: { common: DeskCommon; figs: Partial<Record<ArmName, ArmFigures>>; active: ArmName; sealed: ArmName; onPick: (a: ArmName) => void }) {
  const tail = tailPercent(common);
  const arms = ARM_ORDER.filter((a) => figs[a]);
  const split = (f: ArmFigures, k: "energyUsd" | "wearUsd" | "hedgeUsd") => (f.arm.split ? money(f.arm.split[k]) : "no value");
  const lines: Line[] = [
    { label: "Expected revenue", strong: true, value: (f) => money(f.arm.expectedUsd) },
    { label: "Energy at the node", sub: true, value: (f) => split(f, "energyUsd") },
    { label: "Wear", sub: true, value: (f) => split(f, "wearUsd") },
    { label: "Hedge settlement", sub: true, value: (f) => split(f, "hedgeUsd") },
    { label: "Fees", sub: true, value: (f) => money(-f.feesUsd) },
    { label: `Worst ${tail}%`, note: "mean revenue", value: (f) => money(f.tailUsd) },
    { label: "Score", note: scoreFormula(common), strong: true, value: (f) => money(f.arm.objectiveUsd) },
    { label: "Contracts", value: (f) => count(f.contracts) },
    { label: "Collateral", value: (f) => money(f.arm.collateralUsd) },
    { label: "Discharged", note: "MWh", value: (f) => mw1(f.dischargeMwh) },
    { label: "Ends at", note: "MWh", value: (f) => mw1(f.endSocMwh) },
  ];
  return (
    <div className="gp-table bt-compare">
      <table>
        <caption className="visually-hidden">The three plans compared, in dollars over the operating day unless marked</caption>
        <thead>
          <tr>
            <th scope="col">
              <span>Figure</span>
            </th>
            {arms.map((a) => (
              <th key={a} scope="col" className={`align-right${a === active ? " is-viewed" : ""}`}>
                <button type="button" className="bt-compare__plan" aria-pressed={a === active} onClick={() => onPick(a)} title={`Show plan ${a}: ${planLabel(a).toLowerCase()}`} style={planStyle(a)}>
                  <span className="pk-plan__swatch" aria-hidden="true" />
                  Plan {a}
                  {a === sealed && (
                    <span className="bt-compare__sealed">
                      <Glyph name="seal" />
                      <span className="visually-hidden">sealed</span>
                    </span>
                  )}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.label} className={`${l.sub ? "is-sub" : ""}${l.strong ? " is-strong" : ""}`}>
              <th scope="row">
                {l.label}
                {l.note && <span className="bt-compare__note">{l.note}</span>}
              </th>
              {arms.map((a) => (
                <td key={a} className={`align-right num${a === active ? " is-viewed" : ""}`}>
                  {l.value(figs[a]!)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------- what differs

export function Differences({ lines }: { lines: string[] }) {
  return (
    <ul className="pk-prose bt-differences">
      {lines.map((l) => (
        <li key={l}>{l}</li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------- the asset and its limits

export function Asset({ desk, common }: { desk: Desk; common: DeskCommon }) {
  const a = common.assumptions;
  const p = desk.maxPowerKw / 1000;
  const e = desk.energyKwh / 1000;
  const assumed = a.basis === "assumed";
  return (
    <Facts>
      <Fact label="Settlement point">
        <span className="mono">{desk.settlementPoint}</span>
      </Fact>
      <Fact label="Hub">
        <span className="mono">{desk.hub}</span>
      </Fact>
      <Fact label="Load zone and county">{[desk.zone, desk.county].filter(Boolean).join(", ") || "not on file"}</Fact>
      <Fact label="Power" note="charge and discharge">
        <span className="num">{mw1(p)} MW</span>
      </Fact>
      <Fact label="Energy" note={`${num2(e / p)} hours at full power`}>
        <span className="num">{num2(e)} MWh</span>
      </Fact>
      <Fact label="Operating range" assumed={assumed} note={`${mw1((e * a.soc_min_ppm) / 1e6)} to ${mw1((e * a.soc_max_ppm) / 1e6)} MWh`}>
        <span className="num">
          {ppmPct(a.soc_min_ppm)} to {ppmPct(a.soc_max_ppm)} of energy
        </span>
      </Fact>
      <Fact label="Opens the day at" assumed={assumed} note={`${mw1(startSocMwh(desk, common))} MWh`}>
        <span className="num">{ppmPct(a.soc_open_ppm)}</span>
      </Fact>
      <Fact label="Ends the day at" assumed={assumed} note="or more">
        <span className="num">at least {ppmPct(a.soc_end_min_ppm)}</span>
      </Fact>
      <Fact label="Round-trip efficiency" assumed={assumed} note={`losses ${a.losses.replace(/^taken /, "")}`}>
        <span className="num">{ppmPct(a.round_trip_ppm)}</span>
      </Fact>
      <Fact label="Cycle cap" assumed={assumed} note={`${mw1((e * a.max_cycles_ppm) / 1e6)} MWh discharged`}>
        <span className="num">{num2(a.max_cycles_ppm / 1e6)} a day</span>
      </Fact>
      <Fact label="Wear charge" assumed={assumed} note="per MWh discharged">
        <span className="num">${perMwh(a.wear_cents_per_mwh)}/MWh</span>
      </Fact>
      <Fact label="Hedge limit" note="no more than the hour's scheduled energy">
        <span className="num">{a.max_contracts_per_hour} contracts an hour</span>
      </Fact>
    </Facts>
  );
}

/** The record: the plan's sealed leaf, when it was planned, and the gate. */
export function Record({ desk, common }: { desk: Desk; common: DeskCommon }) {
  const gate = dualTime(common.gate.unix, { seconds: false, date: true });
  const plan = dualTime(common.planTime.unix, { date: true });
  return (
    <Facts className="bt-record">
      <Fact label="Sealed leaf" note={<TabLink to={`/verify/${desk.resource}`}>Verify this plan</TabLink>}>
        <Hash value={desk.leaf} label="leaf hash" />
      </Fact>
      <Fact label="Planned at" note={plan.yours ?? undefined}>
        <span className="num">{plan.ct}</span>
      </Fact>
      <Fact label="Day-ahead gate" note={gate.yours ?? undefined}>
        <span className="num">{gate.ct}</span>
      </Fact>
    </Facts>
  );
}

// ---------------------------------------------------------------- the table view

export function HourTable({ id, desk, common, fig }: { id: string; desk: Desk; common: DeskCommon; fig: ArmFigures }) {
  const entry = common.entryCents[desk.hub] ?? [];
  const { hour } = useHour();
  const narrow = useNarrow();
  // Phones keep the plan's own columns; the price spread and the entry stay on wide screens.
  const band = narrow ? null : desk.nodeScenarioCents;
  const showEntry = !narrow;
  const head = (label: ReactNode, right = true) => (
    <th scope="col" className={right ? "align-right" : undefined}>
      <span>{label}</span>
    </th>
  );
  return (
    <div className="gp-table gp-table--dense bt-hours pk-tight" id={id}>
      <table>
        <caption>
          Plan {fig.name}, {planLabel(fig.name).toLowerCase()}. Prices in $/MWh; power in MW, discharge positive; state of charge in MWh at the end of the hour; contracts of 1 MWh, sold positive.
        </caption>
        <thead>
          <tr>
            {head("Hour (CT)", false)}
            {head(narrow ? "Forecast" : "Node forecast")}
            {band && head("5th to 95th")}
            {showEntry && head("Hub entry, assumed")}
            {head(narrow ? "MW" : "Power, MW")}
            {head(narrow ? "MWh" : "State of charge")}
            {head("Contracts")}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: HOURS }, (_, h) => (
            <tr key={h} className={hour === h ? "is-highlighted" : undefined}>
              <td>
                {hourStart(h)} {!narrow && <span className="muted">{hourEnding(h)}</span>}
              </td>
              <td className="align-right">{perMwh(desk.nodeForecastCents[h] ?? 0)}</td>
              {band && (
                <td className="align-right muted">
                  {perMwh(band.p05[h]!)} to {perMwh(band.p95[h]!)}
                </td>
              )}
              {showEntry && <td className="align-right">{entry[h] !== undefined ? perMwh(entry[h]!) : "no value"}</td>}
              <td className="align-right">{mw1((fig.arm.kw[h] ?? 0) / 1000)}</td>
              <td className="align-right">{mw1(fig.socMwh[h] ?? 0)}</td>
              <td className="align-right">{count(fig.arm.contracts[h] ?? 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
