import { SOURCE_LINE } from "../../config";
import { combine, type ArmName } from "../../data";
import { useDesk, useDeskCommon, type Desk, type DeskCommon } from "../../data/plan";
import { formatOperatingDay } from "../../lib/time";
import { BatteryBar, Glyph, PageHeader, Ready, Section, Stat, StatRow, Table, useBatteryChoice, type Column } from "../../ui";
import { allFigures, type ArmFigures } from "../Battery/model";
import {
  ColumnsChart,
  count,
  delta,
  Fact,
  Facts,
  FanChart,
  fanDomain,
  Flow,
  HourContext,
  hourEnding,
  hourRange,
  HOURS,
  hourStart,
  Key,
  Legend,
  Meters,
  money,
  pct1,
  perMwh,
  planColor,
  PlanName,
  PLANS,
  Readout,
  signedCount,
  TabLink,
  useHour,
  useHourState,
  useHubs,
  useNarrow,
  usdMwh,
  type HubsDoc,
} from "../Battery/kit";
import "./styles.css";

// Hedge: the contracts each plan holds by hour, the entry price the comparison
// assumes for them, ElectronX's published terms and the collateral they need.
// A comparison at an assumed fair-value entry: no order is placed.

const TABLE_ID = "hg-hours";

interface Row {
  hour: number;
  entry: number | null;
  q: Partial<Record<ArmName, number>>;
}

function HedgeReadout({ desk, common, figs, hedged }: { desk: Desk; common: DeskCommon; figs: Partial<Record<ArmName, ArmFigures>>; hedged: ArmName[] }) {
  const { hour } = useHour();
  const entry = common.entryCents[desk.hub];
  const words = (q: number) => (q > 0 ? `sells ${count(q)}` : q < 0 ? `buys ${count(-q)}` : "none");
  if (hour === null) {
    return (
      <Readout
        when="Whole day"
        hint="Tap or point at a chart, or use the arrow keys on it, for one hour."
        values={[
          ...hedged.map((p) => ({
            key: p,
            label: `Plan ${p}`,
            value: count(figs[p]!.contracts),
            unit: "contracts",
            sub: `${count(figs[p]!.sold)} sold, ${count(figs[p]!.bought)} bought`,
            mark: { kind: "bar" as const, plan: planColor(p) },
          })),
          {
            key: "entry",
            label: "Assumed entry",
            value: entry ? usdMwh(Math.min(...entry)) : "no value",
            unit: entry ? `to ${usdMwh(Math.max(...entry))}` : undefined,
            sub: "lowest to highest hour",
            mark: { kind: "line" as const },
          },
        ]}
      />
    );
  }
  return (
    <Readout
      when={hourRange(hour)}
      hint={hourEnding(hour)}
      values={[
        ...hedged.map((p) => ({
          key: p,
          label: `Plan ${p}`,
          value: signedCount(figs[p]!.arm.contracts[hour] ?? 0),
          unit: "contracts",
          sub: words(figs[p]!.arm.contracts[hour] ?? 0),
          mark: { kind: "bar" as const, plan: planColor(p) },
        })),
        { key: "entry", label: "Assumed entry", value: entry ? usdMwh(entry[hour]!) : "no value", unit: "/MWh", sub: `at ${desk.hub}`, mark: { kind: "line" as const } },
      ]}
    />
  );
}

function hubOf(hubs: HubsDoc, hub: string) {
  return hubs.hubs[hub] ?? null;
}

export default function HedgePage() {
  const choice = useBatteryChoice();
  const hourState = useHourState();
  const narrow = useNarrow();
  const all = combine(useDesk(choice.resource), useDeskCommon(), useHubs());

  return (
    <HourContext.Provider value={hourState}>
      <div className="page page--hedge">
        <PageHeader
          title="Hedge"
          lede={
            <>
              Hourly contracts on ElectronX that a plan may sell or buy at the battery's hub, priced at an assumed fair-value entry.
              <Flow>
                It works on the schedule from <TabLink to="/agents/state">State of Charge</TabLink>; <TabLink to="/agents/risk">Risk</TabLink> then weighs what each hedge does
                to the worst outcomes.
              </Flow>
            </>
          }
        />
        <BatteryBar choice={choice} />
        <Ready state={all} label="Loading the hedge">
          {([desk, common, hubs]) => {
            const ins = common.instrument;
            const figs = allFigures(desk, common);
            const plans = PLANS.filter((p) => figs[p]);
            const hedged = plans.filter((p) => figs[p]!.contracts > 0);
            const unhedged = plans.filter((p) => figs[p]!.contracts === 0);
            const sealed = desk.selectedArm;
            const S = figs[sealed]!;
            const budget = common.assumptions.collateral_budget_cents / 100;
            const entry = common.entryCents[desk.hub] ?? null;
            const hub = hubOf(hubs, desk.hub);
            const day0 = formatOperatingDay(common.operatingDay);
            const src = ins.source_urls.find((u) => /^https:\/\//.test(u));
            let maxQ = 1;
            for (const p of plans) for (const q of figs[p]!.arm.contracts) maxQ = Math.max(maxQ, Math.abs(q));
            const rows: Row[] = Array.from({ length: HOURS }, (_, h) => ({
              hour: h,
              entry: entry?.[h] ?? null,
              q: Object.fromEntries(plans.map((p) => [p, figs[p]!.arm.contracts[h] ?? 0])),
            }));
            const shownPlans = narrow ? hedged : plans;
            const cols: Column<Row>[] = [
              { key: "hour", label: "Hour (CT)", kind: "number", align: "left", value: (r) => r.hour, render: (r) => (narrow ? hourStart(r.hour) : `${hourStart(r.hour)} · ${hourEnding(r.hour)}`) },
              { key: "entry", label: narrow ? "Entry" : "Assumed entry, $/MWh", kind: "number", value: (r) => r.entry, render: (r) => (r.entry == null ? "no value" : perMwh(r.entry)) },
              ...shownPlans.map(
                (p): Column<Row> => ({
                  key: p,
                  label: `Plan ${p}`,
                  title: `Plan ${p}: contracts, sold positive`,
                  kind: "number",
                  value: (r) => r.q[p] ?? null,
                  render: (r) => signedCount(r.q[p] ?? 0),
                }),
              ),
            ];
            return (
              <>
                <section className="pk-lead hg-lead" aria-label="The sealed plan's hedge">
                  <div className="pk-lead__line">
                    <span className="pk-lead__state">
                      <Glyph name="seal" />
                      Sealed
                    </span>
                    <PlanName plan={sealed} />
                  </div>
                  {S.contracts > 0 ? (
                    <>
                      <div className="pk-lead__figure">
                        <div className="pk-lead__value num">
                          {count(S.contracts)} <span className="pk-lead__unit">contracts</span>
                        </div>
                        <p className="pk-lead__caption">
                          Sold {count(S.sold)} and bought {count(S.bought)} across {S.hedgedHours} {S.hedgedHours === 1 ? "hour" : "hours"} at {desk.hub}, each for 1 MWh.
                        </p>
                      </div>
                      <StatRow>
                        <Stat label="Expected settlement" value={delta(S.arm.split?.hedgeUsd ?? 0)} note="against the assumed entry, over the scenarios" />
                        <Stat label="Fees" value={money(-S.feesUsd)} note={`$${(ins.fee_cents_per_contract / 100).toFixed(2)} a contract`} />
                        <Stat label="Collateral" value={money(S.arm.collateralUsd)} note={`${pct1(S.arm.collateralUsd / budget)} of the ${money(budget)} budget`} />
                      </StatRow>
                    </>
                  ) : (
                    <p className="pk-lead__caption">The sealed plan holds no contracts: it runs its schedule unhedged.</p>
                  )}
                </section>

                <Section
                  className="hg-hours-section"
                  title="Contracts by Hour"
                  lede={`Contracts held each hour, sold above zero and bought below, on one scale.${unhedged.length ? ` ${unhedged.map((p) => `Plan ${p}`).join(" and ")} ${unhedged.length === 1 ? "holds" : "hold"} none.` : ""}`}
                  source={`${SOURCE_LINE} Operating day ${day0}, hours in CT. Entry: ${ins.entry_rule.replace(/^assumed at fair value: /, "assumed at fair value, ")}. A comparison at that entry, not executed trades.`}
                >
                  <div className="hg-readout">
                    <HedgeReadout desk={desk} common={common} figs={figs} hedged={hedged} />
                  </div>
                  <div className="pk-stack">
                    {hedged.map((p) => (
                      <ColumnsChart
                        key={p}
                        title={<PlanName plan={p} sealed={p === sealed} />}
                        unit="contracts of 1 MWh"
                        values={figs[p]!.arm.contracts}
                        plan={p}
                        maxAbs={maxQ}
                        up="Sell"
                        down="Buy"
                        height={narrow ? 150 : 160}
                        label={`Plan ${p} contracts by hour: sold above zero, bought below`}
                        tableId={TABLE_ID}
                      />
                    ))}
                    {entry && (
                      <FanChart
                        title="Assumed Entry"
                        unit={`$/MWh at ${desk.hub}, beside the hub settlement scenarios`}
                        legend={
                          <Legend>
                            <Key kind="line" label="Assumed entry" />
                            {hub && <Key kind="band-inner" label="Middle half of settlement prices" />}
                            {hub && <Key kind="band" label="5th to 95th percentile" />}
                          </Legend>
                        }
                        forecast={entry}
                        bands={hub?.bands ?? null}
                        domain={fanDomain(entry, hub?.bands.p05, hub?.bands.p95)}
                        height={narrow ? 180 : 200}
                        label={`Assumed entry price at ${desk.hub} in dollars per MWh by hour, with the spread of the hub settlement scenarios`}
                        tableId={TABLE_ID}
                      />
                    )}
                  </div>
                </Section>

                <div className="pk-two">
                  <Section
                    title="Published Terms"
                    lede={`${ins.venue}'s ${ins.product}, as ${ins.venue} publishes it.`}
                    source={
                      src ? (
                        <>
                          Terms:{" "}
                          <a href={src} target="_blank" rel="noreferrer" className="hg-source">
                            {src.replace(/^https:\/\/(www\.)?/, "").replace(/\/$/, "")}
                            <Glyph name="popout" />
                          </a>
                          . Entry: the plan's stated assumption.
                        </>
                      ) : (
                        "Terms as ElectronX publishes them. Entry: the plan's stated assumption."
                      )
                    }
                  >
                    <Facts>
                      <Fact label="Location">
                        <span className="mono">{desk.hub}</span>
                      </Fact>
                      <Fact label="Price range" note="settlement is held inside it">
                        <span className="num">
                          ${perMwh(ins.range_cents[0])} to ${perMwh(ins.range_cents[1])}/MWh
                        </span>
                      </Fact>
                      <Fact label="Size and tick">
                        <span className="num">
                          {ins.size_kwh / 1000} MWh a contract, ${perMwh(ins.tick_cents)}/MWh tick
                        </span>
                      </Fact>
                      <Fact label="Fee">
                        <span className="num">${(ins.fee_cents_per_contract / 100).toFixed(2)} a contract</span>
                      </Fact>
                      <Fact label="Settles on" wide>The mean of the hour's four first-published real-time 15-minute hub prices, held to the range</Fact>
                      <Fact label="Collateral" wide>Seller: (ceiling − entry) × contracts. Buyer: (entry − floor) × contracts.</Fact>
                      <Fact label="Entry" assumed={ins.entry_assumed} note="rounded to the nearest tick" wide>
                        Fair value: the scenario-weighted mean of the hour's settlement price
                      </Fact>
                    </Facts>
                  </Section>
                  <Section
                    title="Collateral by Plan"
                    lede={`Collateral each plan's contracts need, against the ${money(budget)} budget every plan shares.`}
                    source={`${SOURCE_LINE} Collateral by the published rule above, at the assumed entry.`}
                  >
                    <Meters
                      label="Collateral by plan against the budget"
                      rows={plans.map((p) => ({
                        key: p,
                        name: <PlanName plan={p} sealed={p === sealed} long={false} />,
                        share: figs[p]!.arm.collateralUsd / budget,
                        figure: `${money(figs[p]!.arm.collateralUsd)}, ${pct1(figs[p]!.arm.collateralUsd / budget)}`,
                        plan: planColor(p),
                      }))}
                    />
                  </Section>
                </div>

                <Section
                  title="Hour by Hour"
                  lede={`Contracts by hour, sold positive and bought negative, beside the assumed entry.${narrow && unhedged.length ? ` ${unhedged.map((p) => `Plan ${p}`).join(" and ")} holds none.` : ""}`}
                  source={`${SOURCE_LINE} Operating day ${day0}, hours in CT.`}
                >
                  <div id={TABLE_ID}>
                    <Table columns={cols} rows={rows} rowKey={(r) => String(r.hour)} dense className="pk-tight" />
                  </div>
                </Section>
              </>
            );
          }}
        </Ready>
      </div>
    </HourContext.Provider>
  );
}
