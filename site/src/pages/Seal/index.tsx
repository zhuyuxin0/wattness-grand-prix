import { Link } from "react-router-dom";
import { SHOWCASE } from "../../config";
import { useDay, useLateSeal, useReceipts, type DayIndex, type Loaded } from "../../data";
import { captureClock } from "../../lib/capture";
import { formatInt } from "../../lib/format";
import { Countdown, Glyph, Ready, Section } from "../../ui";
import { SceneSlot } from "./SceneSlot";
import { SealedRecord } from "./SealedRecord";
import { WeekendStrip } from "./WeekendStrip";
import "./styles.css";

// Race weekend: the starting grid, qualifying, parc ferme and race day for the
// latest sealed operating day.
export default function RaceWeekendPage() {
  const day = useDay();
  const receipts = useReceipts();
  const late = useLateSeal();
  const all = combine(day, receipts, late);

  return (
    <div className="page page--race-weekend">
      <SceneSlot />

      <header className="rw-hero">
        <div className="rw-hero__text">
          <div className="rw-hero__kicker">Race weekend</div>
          <h1 className="rw-hero__title">Every battery plan, sealed before the market closes.</h1>
          <p className="rw-hero__lede">
            Agents plan tomorrow for every real ERCOT battery. Each plan is sealed on BNB Chain before the 10:00 CT day-ahead gate, and anyone can check any
            battery's plan against the chain.
          </p>
        </div>
        <div className="rw-hero__clock">
          <Countdown now={captureClock()} size="lg" label="Next Parc Ferme" />
        </div>
      </header>

      <Ready state={all}>
        {([d, r, l]) => (
          <>
            <Section className="rw-record" source="Plans: Data: ERCOT. Calculation and display: Wattness. Commits: GateRecord on BNB Smart Chain, read from each chain's receipt.">
              <SealedRecord day={d} receipts={r} late={l} />
            </Section>

            <Section
              kicker="The race weekend"
              title="One operating day, four sessions"
              lede="Times are the record's own: the plan's timestamp, each commit's block, the gate the contract computes."
              source="Times in market time (CT) with Bangkok beside them. Calculation and display: Wattness."
            >
              <WeekendStrip day={d} receipts={r} late={l} />
            </Section>

            <Section
              kicker="The starting grid"
              title={`${formatInt(d.leafCount)} real ERCOT batteries`}
              source={`Each plan is a price-taking day-ahead energy schedule at the battery's settlement point, energy only. Sizes and settlement points as published by the Wattness Terminal, release ${d.inputsRelease}. Data: ERCOT. Calculation and display: Wattness.`}
            >
              <Grid day={d} />
            </Section>
          </>
        )}
      </Ready>
    </div>
  );
}

function Grid({ day }: { day: DayIndex }) {
  const b = day.batteries;
  const power = b.reduce((s, x) => s + x.powerMw, 0);
  const energy = b.reduce((s, x) => s + x.energyMwh, 0);
  const discharge = b.reduce((s, x) => s + x.dischargeMwh, 0);
  const points = new Set(b.map((x) => x.settlementPoint)).size;
  const hubs = new Set(b.map((x) => x.hub)).size;
  const pole = b.find((x) => x.resource === SHOWCASE.resource);

  return (
    <div className="grid-panel">
      <dl className="grid-figures">
        <Figure label="Batteries" value={formatInt(b.length)} note="one sealed plan each" />
        <Figure label="Power" value={formatInt(Math.round(power))} unit="MW" note="sum of maximum discharge" />
        <Figure label="Energy" value={formatInt(Math.round(energy))} unit="MWh" note="sum of storage capacity" />
        <Figure label="Planned discharge" value={formatInt(Math.round(discharge))} unit="MWh" note="the selected plans, over the day" />
        <Figure label="Settlement points" value={formatInt(points)} note={`across ${hubs} trading hubs`} />
      </dl>
      {pole && (
        <Link to="/pit-wall" className="pole">
          <span className="pole__pos num">P1</span>
          <span className="pole__body">
            <span className="pole__name">{SHOWCASE.name}</span>
            <span className="pole__meta mono">
              {pole.resource} · {pole.settlementPoint} · {pole.hub}
            </span>
          </span>
          <span className="pole__size num">
            {formatInt(pole.powerMw)} MW · {pole.energyMwh.toLocaleString("en-US", { maximumFractionDigits: 3 })} MWh
          </span>
          <span className="pole__arm">
            Three arms, arm {pole.selectedArm} selected
            <Glyph name="chevron-right" size={12} />
          </span>
        </Link>
      )}
      <Link to="/standings" className="grid-link">
        Every sealed plan in the standings
        <Glyph name="chevron-right" size={12} />
      </Link>
    </div>
  );
}

function Figure({ label, value, unit, note }: { label: string; value: string; unit?: string; note: string }) {
  return (
    <div className="grid-figure">
      <dt>{label}</dt>
      <dd>
        <span className="grid-figure__value num">
          {value}
          {unit && <span className="grid-figure__unit">{unit}</span>}
        </span>
        <span className="grid-figure__note">{note}</span>
      </dd>
    </div>
  );
}

type Ready3<A, B, C> = Loaded<[A, B, C]>;

function combine<A, B, C>(a: Loaded<A>, b: Loaded<B>, c: Loaded<C>): Ready3<A, B, C> {
  for (const s of [a, b, c]) if (s.status === "error") return s;
  if (a.status === "ready" && b.status === "ready" && c.status === "ready") return { status: "ready", data: [a.data, b.data, c.data] };
  return { status: "loading" };
}
