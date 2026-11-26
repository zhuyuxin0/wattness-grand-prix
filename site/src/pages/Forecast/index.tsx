import { SHOWCASE, SOURCE_LINE } from "../../config";
import { combine, loadScenarios, useLoad, useReceipts, type ScenarioDigest } from "../../data";
import { useDesk, useDeskCommon, type Desk, type DeskCommon } from "../../data/plan";
import { formatOperatingDay } from "../../lib/time";
import { BatteryBar, PageHeader, Ready, Section, Table, useBatteryChoice, type Column } from "../../ui";
import {
  count,
  dayRange,
  Fact,
  Facts,
  fanDomain,
  FanChart,
  Flow,
  HourContext,
  hourEnding,
  hourRange,
  HOURS,
  hourStart,
  Key,
  Legend,
  perMwh,
  Readout,
  shortDay,
  TabLink,
  useHour,
  useHourState,
  useNarrow,
  usdMwh,
  useHubs,
  type HubBands,
} from "../Battery/kit";
import { CournotCard, weightingWords } from "./Cournot";
import { RadarObject } from "./RadarObject";
import "./styles.css";

// Forecast: the prices a plan is solved against. The node's day-ahead forecast
// and the spread of its scenarios lead; the hub's side of the same scenarios
// (what each hedge contract settles on) and how the scenarios are built follow.

/** Sample paths are published for the showcase battery only; no other battery asks for them. */
const useDigest = (resource: string) =>
  useLoad<ScenarioDigest | null>(() => (resource === SHOWCASE.resource ? loadScenarios(resource) : Promise.resolve(null)), `forecast:digest:${resource}`);

const TABLE_ID = "fc-hours";

interface Row {
  hour: number;
  node: number;
  p05: number | null;
  p25: number | null;
  p75: number | null;
  p95: number | null;
  hub: number | null;
  settle: number | null;
}

function rows(desk: Desk, common: DeskCommon, hub: HubBands | undefined): Row[] {
  const b = desk.nodeScenarioCents;
  const hf = common.hubForecastCents[desk.hub];
  return Array.from({ length: HOURS }, (_, h) => ({
    hour: h,
    node: desk.nodeForecastCents[h]!,
    p05: b?.p05[h] ?? null,
    p25: b?.p25[h] ?? null,
    p75: b?.p75[h] ?? null,
    p95: b?.p95[h] ?? null,
    hub: hf?.[h] ?? null,
    settle: hub?.p50[h] ?? null,
  }));
}

const cell = (v: number | null) => (v == null ? <span className="muted">no value</span> : perMwh(v));
const range = (lo: number | null | undefined, hi: number | null | undefined) => (lo == null || hi == null ? "no value" : `${usdMwh(lo)} to ${usdMwh(hi)}`);
const listDays = (days: { day: string }[]) => {
  const names = days.map((d) => shortDay(d.day));
  return names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
};

function NodeReadout({ desk, common }: { desk: Desk; common: DeskCommon }) {
  const { hour } = useHour();
  const fc = desk.nodeForecastCents;
  const b = desk.nodeScenarioCents;
  const hf = common.hubForecastCents[desk.hub];
  if (hour === null) {
    const lo = fc.indexOf(Math.min(...fc));
    const hi = fc.indexOf(Math.max(...fc));
    let wide = 0;
    if (b) for (let h = 1; h < HOURS; h++) if (b.p95[h]! - b.p05[h]! > b.p95[wide]! - b.p05[wide]!) wide = h;
    return (
      <Readout
        when="Whole day"
        hint="Tap or point at a chart, or use the arrow keys on it, for one hour."
        values={[
          { key: "mean", label: "Forecast, day mean", value: usdMwh(fc.reduce((s, v) => s + v, 0) / HOURS), unit: "/MWh", sub: `at ${desk.settlementPoint}`, mark: { kind: "line" } },
          { key: "lo", label: "Lowest hour", value: usdMwh(fc[lo]!), unit: "/MWh", sub: `${hourStart(lo)} CT`, mark: { kind: "line" } },
          { key: "hi", label: "Highest hour", value: usdMwh(fc[hi]!), unit: "/MWh", sub: `${hourStart(hi)} CT`, mark: { kind: "line" } },
          {
            key: "wide",
            label: "Widest spread",
            value: b ? `${hourStart(wide)}` : "no value",
            sub: b ? `5–95%: ${range(b.p05[wide], b.p95[wide])}` : undefined,
            mark: { kind: "band" },
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
        { key: "fc", label: "Forecast", value: usdMwh(fc[hour]!), unit: "/MWh", sub: `at ${desk.settlementPoint}`, mark: { kind: "line" } },
        { key: "mid", label: "Middle half", value: b ? usdMwh(b.p25[hour]!) : "no value", unit: b ? `to ${usdMwh(b.p75[hour]!)}` : undefined, sub: "25th to 75th percentile", mark: { kind: "band-inner" } },
        { key: "wide", label: "5th to 95th", value: b ? usdMwh(b.p05[hour]!) : "no value", unit: b ? `to ${usdMwh(b.p95[hour]!)}` : undefined, sub: "90% of scenarios", mark: { kind: "band" } },
        { key: "hub", label: "Hub forecast", value: hf ? usdMwh(hf[hour]!) : "no value", unit: "/MWh", sub: `at ${desk.hub}`, mark: { kind: "line" } },
      ]}
    />
  );
}

export default function ForecastPage() {
  const choice = useBatteryChoice();
  const hourState = useHourState();
  const narrow = useNarrow();
  const all = combine(useDesk(choice.resource), useDeskCommon(), useHubs(), useDigest(choice.resource));
  const receipts = useReceipts();
  const sealedUnix = receipts.status === "ready" && receipts.data.receipts.length ? Math.min(...receipts.data.receipts.map((r) => r.blockTime)) : null;

  return (
    <HourContext.Provider value={hourState}>
      <div className="page page--forecast">
        <PageHeader
          title="Forecast"
          lede={
            <>
              The prices every plan for this battery is solved against: a day-ahead forecast at its node, and scenarios of where real prices could land around it.
              <Flow>
                The first agent. Its scenarios feed <TabLink to="/agents/state">State of Charge</TabLink>, which fits the schedule to them, and <TabLink to="/agents/risk">Risk</TabLink>,
                which scores each plan over them.
              </Flow>
            </>
          }
        />
        <RadarObject />
        <BatteryBar choice={choice} />
        <Ready state={all} label="Loading the scenarios">
          {([desk, common, hubs, digest]) => {
            const hub = hubs.hubs[desk.hub];
            const hubFc = common.hubForecastCents[desk.hub] ?? null;
            const nodePaths = digest && digest.resource === desk.resource ? digest.samplePaths : null;
            const b = desk.nodeScenarioCents;
            const domain = fanDomain(desk.nodeForecastCents, b?.p05, b?.p95, hubFc, hub?.bands.p05, hub?.bands.p95, ...(nodePaths ?? []), ...(hub?.paths ?? []));
            const day0 = formatOperatingDay(common.operatingDay);
            const ref = hubs.reference;
            const weighted = weightingWords(common.scenarios.weighting);
            const cols: Column<Row>[] = narrow
              ? [
                  { key: "hour", label: "Hour (CT)", kind: "number", align: "left", value: (r) => r.hour, render: (r) => hourStart(r.hour) },
                  { key: "node", label: "Forecast", kind: "number", value: (r) => r.node, render: (r) => cell(r.node) },
                  { key: "p95", label: "5th to 95th", title: "Sorts by the 95th percentile", kind: "number", value: (r) => r.p95, render: (r) => (r.p05 == null ? cell(null) : `${perMwh(r.p05)} to ${perMwh(r.p95!)}`) },
                  { key: "hub", label: "Hub", kind: "number", value: (r) => r.hub, render: (r) => cell(r.hub) },
                ]
              : [
                  { key: "hour", label: "Hour (CT)", kind: "number", align: "left", value: (r) => r.hour, render: (r) => `${hourStart(r.hour)} · ${hourEnding(r.hour)}` },
                  { key: "node", label: "Node forecast", kind: "number", value: (r) => r.node, render: (r) => cell(r.node) },
                  { key: "p05", label: "5th", title: "5th percentile of the scenarios", kind: "number", value: (r) => r.p05, render: (r) => cell(r.p05) },
                  { key: "p25", label: "25th", title: "25th percentile", kind: "number", value: (r) => r.p25, render: (r) => cell(r.p25) },
                  { key: "p75", label: "75th", title: "75th percentile", kind: "number", value: (r) => r.p75, render: (r) => cell(r.p75) },
                  { key: "p95", label: "95th", title: "95th percentile", kind: "number", value: (r) => r.p95, render: (r) => cell(r.p95) },
                  { key: "hub", label: `Hub forecast (${desk.hub})`, kind: "number", value: (r) => r.hub, render: (r) => cell(r.hub) },
                  { key: "settle", label: "Hub settlement, median", kind: "number", value: (r) => r.settle, render: (r) => cell(r.settle) },
                ];
            return (
              <>
                <Section
                  className="fc-lead"
                  title={`Price Scenarios at the Node (${desk.settlementPoint})`}
                  lede={`The day-ahead forecast this battery's plans used for ${day0}, and the ${count(common.scenarios.count)} ${weighted} scenarios around it, in $/MWh.`}
                  source={`${SOURCE_LINE} Operating day ${day0}, hours in CT. Forecast: the hub forecast plus the node's average day-ahead basis to the hub over the basis days.${
                    nodePaths ? ` Thin lines: ${nodePaths.length} of the ${count(common.scenarios.count)} scenarios, one per history day, each with the first basis day.` : ""
                  }${weighted === "equally weighted" ? "" : " Percentiles count each scenario once; the plans weigh them as the weather rule below sets."}`}
                >
                  <div className="fc-readout">
                    <NodeReadout desk={desk} common={common} />
                  </div>
                  <FanChart
                    title="Node Price"
                    unit={`$/MWh at ${desk.settlementPoint}`}
                    legend={
                      <Legend>
                        <Key kind="line" label="Forecast the plan used" />
                        <Key kind="band-inner" label="Middle half of scenarios" />
                        <Key kind="band" label="5th to 95th percentile" />
                        {nodePaths && <Key kind="path" label={`${nodePaths.length} sample scenarios`} />}
                      </Legend>
                    }
                    forecast={desk.nodeForecastCents}
                    bands={b}
                    paths={nodePaths}
                    domain={domain}
                    height={narrow ? 240 : 300}
                    label={`Node price scenarios at ${desk.settlementPoint} in dollars per MWh by hour: the forecast, the middle half and the 5th to 95th percentile`}
                    tableId={TABLE_ID}
                  />
                </Section>

                <div className="pk-two">
                  <Section
                    title={`At the Hub (${desk.hub})`}
                    lede={`What a hedge contract settles on: the hour's real-time hub price, held to the contract's $0 to $100 range. One path per history day; ${hub ? `${hub.batteries} batteries share them` : "no hub file"}.`}
                    source={`${SOURCE_LINE} Hub forecast: the reference days' day-ahead hub prices, weighted. Settlement: the mean of the hour's four 15-minute real-time hub prices in each history day's scenario.`}
                  >
                    {hub && hubFc ? (
                      <FanChart
                        title="Hub Price"
                        unit={`$/MWh at ${desk.hub}, same scale as the node`}
                        legend={
                          <Legend>
                            <Key kind="line" label="Hub forecast" />
                            <Key kind="band-inner" label="Middle half" />
                            <Key kind="band" label="5th to 95th" />
                            <Key kind="path" label={`${hub.paths.length} history days`} />
                          </Legend>
                        }
                        forecast={hubFc}
                        bands={hub.bands}
                        paths={hub.paths}
                        domain={domain}
                        height={narrow ? 220 : 260}
                        label={`Hub settlement price scenarios at ${desk.hub} in dollars per MWh by hour, with the hub forecast`}
                        tableId={TABLE_ID}
                      />
                    ) : (
                      <p className="pk-scope">No hub scenarios are on file for {desk.hub}.</p>
                    )}
                  </Section>

                  <Section title="How the Scenarios Are Built" source={`${SOURCE_LINE} The same days and rule for all ${common.batteries} batteries.`}>
                    <Facts className="fc-method">
                      <Fact
                        label="Day type"
                        note={
                          ref.dayType === "offpeak"
                            ? `${day0} is off-peak: weekends and NERC holidays count together.`
                            : `${day0} is a weekday: only weekdays that are not NERC holidays count.`
                        }
                      >
                        {ref.dayType === "offpeak" ? "Off-peak" : ref.dayType === "weekday" ? "Weekday" : ref.dayType}
                      </Fact>
                      <Fact label="Forecast reference days" note={`The newest ${ref.dayType === "offpeak" ? "off-peak days" : ref.dayType === "weekday" ? "weekdays" : `${ref.dayType} days`} at least ${ref.lagDays} days before the operating day, weighted ${ref.days.map((d) => d.weight).join(", ")}.`}>
                        {listDays(ref.days)}, {ref.days[0]?.day.slice(0, 4)}
                      </Fact>
                      <Fact label="Basis days" note="The node's day-ahead price minus the hub's, averaged by hour, moves the hub forecast to the node.">
                        {count(hubs.basisDays.length)} days, {dayRange(hubs.basisDays)}
                      </Fact>
                      <Fact label="History days" note="Each gives the hub's day-ahead and real-time misses against the same forecast rule.">
                        {count(hubs.historyDays.length)} days, {dayRange(hubs.historyDays)}
                      </Fact>
                      <Fact label="Scenarios" note={`Every history day crossed with every basis day, ${weighted === "equally weighted" ? "equally weighted" : "weighted by the weather rule below"}, no random numbers.`}>
                        <span className="num">
                          {count(hubs.count)} = {hubs.historyDays.length} × {hubs.basisDays.length}
                        </span>
                      </Fact>
                    </Facts>
                  </Section>
                </div>

                <CournotCard
                  common={common}
                  desk={desk}
                  hubName={desk.hub}
                  hub={hub}
                  historyDays={hubs.historyDays}
                  basisCount={hubs.basisDays.length}
                  sealedUnix={receipts.status === "ready" && receipts.data.operatingDay === common.operatingDay ? sealedUnix : null}
                />

                <Section
                  title="Hour by Hour"
                  lede={`In $/MWh. The node's forecast and scenario percentiles, and the hub's forecast${narrow ? "" : " and median settlement price"}.`}
                  source={`${SOURCE_LINE} Operating day ${day0}, hours in CT.`}
                >
                  <div id={TABLE_ID}>
                    <Table columns={cols} rows={rows(desk, common, hub?.bands)} rowKey={(r) => String(r.hour)} dense className="pk-tight" />
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
