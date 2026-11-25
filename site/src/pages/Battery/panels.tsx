import type { ReactNode } from "react";
import type { ArmName } from "../../data";
import { arm as armTokens } from "../../design/tokens";
import { dualTime } from "../../lib/time";
import { Glyph, Hash } from "../../ui";
import { useHour } from "./chart-kit";
import type { Desk, DeskCommon } from "./data";
import {
  ARM_ORDER,
  count,
  HOURS,
  hourEnding,
  hourRange,
  hourStart,
  lambda,
  money,
  mw1,
  num2,
  pct1,
  perMwh,
  usdMwh,
  startSocMwh,
  tailPercent,
  type ArmFigures,
} from "./model";

const ppmPct = (ppm: number) => `${Math.round(ppm / 1e4)}%`;

// ---------------------------------------------------------------- arm control

export function ArmControl({ value, sealed, onChange, available }: { value: ArmName; sealed: ArmName; available: ArmName[]; onChange: (a: ArmName) => void }) {
  return (
    <div className="pw-arms" role="radiogroup" aria-label="Arm">
      {ARM_ORDER.map((a) => {
        const on = a === value;
        const has = available.includes(a);
        return (
          <button
            key={a}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={!has}
            className={`pw-arms__opt${on ? " is-on" : ""}`}
            style={{ ["--arm" as string]: armTokens[a].color }}
            onClick={() => onChange(a)}
            onKeyDown={(e) => {
              if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
              e.preventDefault();
              const i = ARM_ORDER.indexOf(a) + (e.key === "ArrowRight" ? 1 : -1);
              const next = ARM_ORDER[(i + ARM_ORDER.length) % ARM_ORDER.length]!;
              onChange(next);
              (e.currentTarget.parentElement?.querySelector(`[data-arm="${next}"]`) as HTMLElement | null)?.focus();
            }}
            data-arm={a}
            tabIndex={on ? 0 : -1}
          >
            <span className="pw-arms__key" aria-hidden="true" />
            <span className="pw-arms__letter">{a}</span>
            <span className="pw-arms__label">{armTokens[a].label}</span>
            {a === sealed && (
              <span className="pw-arms__sealed" title={`Arm ${a} was sealed`}>
                <Glyph name="seal" size={12} />
                <span className="visually-hidden">sealed</span>
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- readout

export function Readout({ desk, common, fig }: { desk: Desk; common: DeskCommon; fig: ArmFigures }) {
  const { hour } = useHour();
  const e = desk.energyKwh / 1000;
  if (hour === null) {
    return (
      <div className="pw-readout" aria-live="polite">
        <div className="pw-readout__when">
          <span className="pw-readout__time">Whole day</span>
          <span className="muted">Arm {fig.name}, hover or use the arrow keys for an hour</span>
        </div>
        <dl className="pw-readout__vals">
          <Val label="Discharged" value={mw1(fig.dischargeMwh)} unit="MWh" />
          <Val label="Charged" value={mw1(fig.chargeMwh)} unit="MWh" />
          <Val label="Ends at" value={mw1(fig.endSocMwh)} unit="MWh" sub={`${pct1(fig.endSocShare)} of energy`} />
          <Val label="Contracts" value={count(fig.contracts)} sub={`${fig.hedgedHours} ${fig.hedgedHours === 1 ? "hour" : "hours"} hedged`} />
        </dl>
      </div>
    );
  }
  const kw = fig.arm.kw[hour] ?? 0;
  const soc = fig.socMwh[hour] ?? 0;
  const q = fig.arm.contracts[hour] ?? 0;
  const entry = common.entryCents[desk.hub]?.[hour];
  const band = desk.nodeScenarioCents;
  return (
    <div className="pw-readout" aria-live="polite">
      <div className="pw-readout__when">
        <span className="pw-readout__time">{hourRange(hour)}</span>
        <span className="muted">{hourEnding(hour)}</span>
      </div>
      <dl className="pw-readout__vals">
        <Val
          label="Forecast"
          value={usdMwh(desk.nodeForecastCents[hour] ?? 0)}
          unit="/MWh"
          sub={band ? `Scenarios ${usdMwh(band.p05[hour]!)} to ${usdMwh(band.p95[hour]!)}` : undefined}
        />
        <Val label={kw > 0 ? "Discharge" : kw < 0 ? "Charge" : "Schedule"} value={kw === 0 ? "Idle" : mw1(Math.abs(kw) / 1000)} unit={kw === 0 ? "" : "MW"} />
        <Val label="End of hour" value={mw1(soc)} unit="MWh" sub={`${pct1(soc / e)} of energy`} />
        <Val
          label={q > 0 ? "Sold" : q < 0 ? "Bought" : "Hedge"}
          value={q === 0 ? "None" : count(Math.abs(q))}
          unit={q === 0 ? "" : "contracts"}
          sub={entry !== undefined ? `Entry ${usdMwh(entry)}/MWh, assumed` : undefined}
        />
      </dl>
    </div>
  );
}

function Val({ label, value, unit, sub }: { label: string; value: ReactNode; unit?: string; sub?: string }) {
  return (
    <div className="pw-val">
      <dt>{label}</dt>
      <dd>
        <span className="pw-val__num num">{value}</span>
        {unit && <span className="pw-val__unit">{unit}</span>}
        {sub && <span className="pw-val__sub num">{sub}</span>}
      </dd>
    </div>
  );
}

// ---------------------------------------------------------------- mandate

function Row({ label, children, assumed }: { label: string; children: ReactNode; assumed?: boolean }) {
  return (
    <div className="pw-dl__row">
      <dt>
        {label}
        {assumed && <span className="pw-tag">Assumed</span>}
      </dt>
      <dd>{children}</dd>
    </div>
  );
}

export function Mandate({ desk, common, name }: { desk: Desk; common: DeskCommon; name?: string }) {
  const a = common.assumptions;
  const p = desk.maxPowerKw / 1000;
  const e = desk.energyKwh / 1000;
  const gate = dualTime(common.gate.unix, { seconds: false });
  const plan = dualTime(common.planTime.unix);
  const assumed = a.basis === "assumed";
  return (
    <div className="pw-mandate">
      <div className="pw-mandate__id">
        {name && <div className="pw-mandate__name">{name}</div>}
        <div className="pw-mandate__code">{desk.resource}</div>
      </div>
      <dl className="pw-dl">
        <Row label="Settlement point">
          <span className="mono">{desk.settlementPoint}</span>
        </Row>
        <Row label="Hub">
          <span className="mono">{desk.hub}</span>
        </Row>
        {(desk.zone || desk.county) && <Row label="Zone, county">{[desk.zone, desk.county].filter(Boolean).join(", ")}</Row>}
        <Row label="Power">
          <span className="num">{mw1(p)}</span> MW
        </Row>
        <Row label="Energy">
          <span className="num">{num2(e)}</span> MWh · <span className="num">{num2(e / p)}</span> h
        </Row>
      </dl>
      <div className="pw-mandate__sub">Mandate for the day</div>
      <dl className="pw-dl">
        <Row label="Start state of charge" assumed={assumed}>
          <span className="num">{ppmPct(a.soc_open_ppm)}</span> · <span className="num">{mw1(startSocMwh(desk, common))}</span> MWh
        </Row>
        <Row label="End state of charge" assumed={assumed}>
          at least <span className="num">{ppmPct(a.soc_end_min_ppm)}</span>
        </Row>
        <Row label="Operating range" assumed={assumed}>
          <span className="num">
            {ppmPct(a.soc_min_ppm)}–{ppmPct(a.soc_max_ppm)}
          </span>
        </Row>
        <Row label="Round-trip efficiency" assumed={assumed}>
          <span className="num">{ppmPct(a.round_trip_ppm)}</span>, losses {a.losses.replace(/^taken /, "")}
        </Row>
        <Row label="Cycle cap" assumed={assumed}>
          <span className="num">{num2(a.max_cycles_ppm / 1e6)}</span> a day · <span className="num">{mw1((e * a.max_cycles_ppm) / 1e6)}</span> MWh out
        </Row>
        <Row label="Wear charge" assumed={assumed}>
          $<span className="num">{perMwh(a.wear_cents_per_mwh)}</span>/MWh discharged
        </Row>
        <Row label="Hedge limit">
          the hour's scheduled energy, at most <span className="num">{a.max_contracts_per_hour}</span> contracts
        </Row>
        <Row label="Collateral budget">{money(a.collateral_budget_cents / 100)}</Row>
      </dl>
      <div className="pw-mandate__sub">Decision cutoff</div>
      <div className="pw-cutoff">
        <div className="pw-cutoff__time">{gate.ct}</div>
        <div className="pw-cutoff__alt num">{gate.bangkok}</div>
        <div className="pw-cutoff__note">ERCOT's day-ahead gate. Planned at {plan.ct}.</div>
      </div>
      <div className="pw-mandate__leaf">
        <div className="pw-mandate__sub">Sealed leaf</div>
        <Hash value={desk.leaf} label="leaf hash" />
        <a className="pw-link" href="#/stewards">
          Check it with the stewards
          <Glyph name="chevron-right" size={12} />
        </a>
      </div>
      <p className="pw-scope">{common.physicalScope.replace(/^./, (c) => c.toUpperCase())}.</p>
    </div>
  );
}

// ---------------------------------------------------------------- arms compared

interface Line {
  label: string;
  note?: string;
  sub?: boolean;
  strong?: boolean;
  value: (f: ArmFigures) => string;
}

export function Compare({ common, figs, active, sealed, onPick }: { common: DeskCommon; figs: Partial<Record<ArmName, ArmFigures>>; active: ArmName; sealed: ArmName; onPick: (a: ArmName) => void }) {
  const tail = tailPercent(common);
  const lam = lambda(common);
  const arms = ARM_ORDER.filter((a) => figs[a]);
  const lines: Line[] = [
    { label: "Expected revenue", strong: true, value: (f) => money(f.arm.expectedUsd) },
    { label: "Energy", sub: true, value: (f) => (f.arm.split ? money(f.arm.split.energyUsd) : "—") },
    { label: "Wear", sub: true, value: (f) => (f.arm.split ? money(f.arm.split.wearUsd) : "—") },
    { label: "Hedge", sub: true, value: (f) => (f.arm.split ? money(f.arm.split.hedgeUsd) : "—") },
    { label: "Fees", sub: true, value: (f) => money(-f.feesUsd) },
    { label: "Downside", note: `worst ${tail}%, mean`, value: (f) => money(f.tailUsd) },
    { label: "Objective", note: `mean − ${num2(lam)} × CVaR`, strong: true, value: (f) => money(f.arm.objectiveUsd) },
    { label: "Contracts", value: (f) => count(f.contracts) },
    { label: "Collateral", value: (f) => money(f.arm.collateralUsd) },
    { label: "Discharged", note: "MWh", value: (f) => mw1(f.dischargeMwh) },
  ];
  return (
    <div className="pw-compare" role="table" aria-label="The three arms compared">
      <div className="pw-compare__row pw-compare__head" role="row">
        <span role="columnheader" className="pw-compare__label">
          <span className="visually-hidden">Figure</span>
        </span>
        {arms.map((a) => (
          <button
            key={a}
            type="button"
            role="columnheader"
            className={`pw-compare__arm${a === active ? " is-on" : ""}`}
            style={{ ["--arm" as string]: armTokens[a].color }}
            onClick={() => onPick(a)}
            aria-pressed={a === active}
            title={armTokens[a].label}
          >
            <span className="pw-compare__letter">{a}</span>
            {a === sealed && (
              <span className="pw-compare__sealed">
                <Glyph name="seal" size={11} />
                Sealed
              </span>
            )}
          </button>
        ))}
      </div>
      {lines.map((l) => (
        <div key={l.label} className={`pw-compare__row${l.sub ? " is-sub" : ""}${l.strong ? " is-strong" : ""}`} role="row">
          <span role="rowheader" className="pw-compare__label">
            {l.label}
            {l.note && <span className="pw-compare__note">{l.note}</span>}
          </span>
          {arms.map((a) => (
            <span key={a} role="cell" className={`pw-compare__cell num${a === active ? " is-on" : ""}`}>
              {l.value(figs[a]!)}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- hedge terms

export function Terms({ desk, common }: { desk: Desk; common: DeskCommon }) {
  const t = common.instrument;
  const [lo, hi] = t.range_cents;
  const entries = common.entryCents[desk.hub] ?? [];
  const minE = Math.min(...entries);
  const maxE = Math.max(...entries);
  const src = t.source_urls.find((u) => /^https:\/\//.test(u));
  return (
    <div className="pw-terms">
      <dl className="pw-dl">
        <Row label="Venue, product">
          {t.venue}, {t.product}
        </Row>
        <Row label="Location">
          <span className="mono">{desk.hub}</span>
        </Row>
        <Row label="Price range">
          $<span className="num">{perMwh(lo)}</span>–<span className="num">{perMwh(hi)}</span>/MWh
        </Row>
        <Row label="Tick, size">
          $<span className="num">{perMwh(t.tick_cents)}</span>/MWh · <span className="num">{t.size_kwh / 1000}</span> MWh a contract
        </Row>
        <Row label="Fee">
          $<span className="num">{(t.fee_cents_per_contract / 100).toFixed(2)}</span> a contract
        </Row>
        <Row label="Settles on">{t.settlement.replace("clip(", "the ").replace(", floor, ceiling)", ", held to the range")}</Row>
        <Row label="Collateral">{t.collateral.replace(/x contracts/g, "× contracts").replace(/ - /g, " − ")}</Row>
        <Row label="Entry" assumed={t.entry_assumed}>
          {entries.length > 0 && (
            <>
              $<span className="num">{perMwh(minE)}</span>–<span className="num">{perMwh(maxE)}</span>/MWh by hour.{" "}
            </>
          )}
          {t.entry_rule.replace(/^assumed at fair value: /, "Fair value: ")}.
        </Row>
      </dl>
      <p className="pw-scope">
        Published contract terms{src && (
          <>
            {" "}
            from{" "}
            <a href={src} target="_blank" rel="noreferrer">
              {src.replace(/^https:\/\/(www\.)?/, "").replace(/\/$/, "")}
            </a>
          </>
        )}
        . The entry is assumed, not a market price: this is a scenario comparison, never an executed trade.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- race engineer

export function Engineer({ lines, count: n }: { lines: string[]; count: number }) {
  return (
    <div className="pw-engineer">
      <ol className="pw-engineer__lines">
        {lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ol>
      <p className="pw-scope">
        Written by fixed rules from this battery's sealed plan; every figure is the plan's own. Expected and downside figures are over {n} equally weighted price scenarios.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- the table view

export function HourTable({ id, desk, common, fig }: { id: string; desk: Desk; common: DeskCommon; fig: ArmFigures }) {
  const entry = common.entryCents[desk.hub] ?? [];
  const band = desk.nodeScenarioCents;
  const { hour } = useHour();
  return (
    <div className="gp-table gp-table--dense pw-hours" id={id}>
      <table>
        <caption>
          Arm {fig.name}, {armTokens[fig.name].label.toLowerCase()}. Prices in $/MWh, power in MW (discharge positive), state of charge at the end of the hour, contracts of 1 MWh (sold positive).
        </caption>
        <thead>
          <tr>
            <th scope="col">
              <span>Hour, CT</span>
            </th>
            <th scope="col" className="align-right">
              <span>Node forecast</span>
            </th>
            {band && (
              <th scope="col" className="align-right">
                <span>Scenarios 5–95%</span>
              </th>
            )}
            <th scope="col" className="align-right">
              <span>Hub entry, assumed</span>
            </th>
            <th scope="col" className="align-right">
              <span>MW</span>
            </th>
            <th scope="col" className="align-right">
              <span>MWh</span>
            </th>
            <th scope="col" className="align-right">
              <span>Contracts</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: HOURS }, (_, h) => (
            <tr key={h} className={hour === h ? "is-highlighted" : undefined}>
              <td>
                {hourStart(h)} <span className="muted">{hourEnding(h)}</span>
              </td>
              <td className="align-right">{perMwh(desk.nodeForecastCents[h] ?? 0)}</td>
              {band && (
                <td className="align-right muted">
                  {perMwh(band.p05[h]!)} to {perMwh(band.p95[h]!)}
                </td>
              )}
              <td className="align-right">{entry[h] !== undefined ? perMwh(entry[h]!) : "—"}</td>
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

