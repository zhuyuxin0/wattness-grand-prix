import { SOURCE_LINE } from "../../config";
import { combine, fetchJson, useLoad } from "../../data";
import { useDesk, useDeskCommon, type Desk, type DeskCommon } from "../../data/plan";
import { dollarsPerMwh, hourEndingLabel, hourStartLabel, HOURS_OF_DAY } from "../../lib/hours";
import { formatOperatingDay } from "../../lib/time";
import { BatteryBar, PageHeader, Ready, Section, Stat, StatRow, Table, useBatteryChoice, type Column } from "../../ui";

// Forecast: the price scenarios a plan was solved against. The node's
// day-ahead forecast with its spread over the scenarios, the hub's forecast,
// and the days the scenarios are built from.

interface PackTemplate {
  template: {
    scenarios: { history_days: string[]; basis_days: string[]; count: number; weighting: string };
    forecast: { reference_days: { day: string; weight: number }[]; day_type: string; lag_days: number };
  };
}

const usePack = () => useLoad(() => fetchJson<PackTemplate>("stewards/pack.json"), "stewards:pack");

interface Row {
  hour: number;
  node: number;
  p05: number | null;
  p25: number | null;
  p75: number | null;
  p95: number | null;
  hub: number | null;
}

function rows(desk: Desk, common: DeskCommon): Row[] {
  const b = desk.nodeScenarioCents;
  const hub = common.hubForecastCents[desk.hub];
  return HOURS_OF_DAY.map((h) => ({
    hour: h,
    node: desk.nodeForecastCents[h]!,
    p05: b?.p05[h] ?? null,
    p25: b?.p25[h] ?? null,
    p75: b?.p75[h] ?? null,
    p95: b?.p95[h] ?? null,
    hub: hub?.[h] ?? null,
  }));
}

const span = (days: string[]) => (days.length ? `${formatOperatingDay(days[0]!)} to ${formatOperatingDay(days[days.length - 1]!)}` : "none");

export default function ForecastPage() {
  const choice = useBatteryChoice();
  const all = combine(useDesk(choice.resource), useDeskCommon(), usePack());

  return (
    <div className="page page--forecast">
      <PageHeader
        title="Forecast"
        lede="Every plan is solved against the same kind of price outlook: a day-ahead forecast at the battery's own node, and scenarios built from how real prices missed that forecast on earlier days."
      />
      <BatteryBar choice={choice} />
      <Ready state={all}>
        {([desk, common, pack]) => {
          const t = pack.template;
          const cols: Column<Row>[] = [
            { key: "hour", label: "Hour (CT)", kind: "number", align: "left", value: (r) => r.hour, render: (r) => `${hourStartLabel(r.hour)} · ${hourEndingLabel(r.hour)}` },
            { key: "node", label: "Node forecast", kind: "number", value: (r) => r.node, render: (r) => dollarsPerMwh(r.node) },
            { key: "p05", label: "5th pct", kind: "number", value: (r) => r.p05, render: (r) => dollarsPerMwh(r.p05) },
            { key: "p25", label: "25th pct", kind: "number", value: (r) => r.p25, render: (r) => dollarsPerMwh(r.p25) },
            { key: "p75", label: "75th pct", kind: "number", value: (r) => r.p75, render: (r) => dollarsPerMwh(r.p75) },
            { key: "p95", label: "95th pct", kind: "number", value: (r) => r.p95, render: (r) => dollarsPerMwh(r.p95) },
            { key: "hub", label: `Hub forecast (${desk.hub})`, kind: "number", value: (r) => r.hub, render: (r) => dollarsPerMwh(r.hub) },
          ];
          return (
            <>
              <Section
                title="Price outlook by hour"
                lede={`At ${desk.settlementPoint}, in $/MWh: the forecast the plan used, and where the ${common.scenarios.count} scenarios fall around it.`}
                source={`${SOURCE_LINE} Operating day ${formatOperatingDay(common.operatingDay)}, hours in CT. ${common.forecast.nodeRule.replace(/^./, (c) => c.toUpperCase())}.`}
              >
                <Table columns={cols} rows={rows(desk, common)} rowKey={(r) => String(r.hour)} dense />
              </Section>
              <Section title="How the scenarios are built" lede={common.scenarios.method.replace(/^./, (c) => c.toUpperCase()) + "."} source={SOURCE_LINE}>
                <StatRow>
                  <Stat label="Scenarios" value={String(t.scenarios.count)} note={`${t.scenarios.weighting} weights, no random numbers`} />
                  <Stat label="History days" value={String(t.scenarios.history_days.length)} size="sm" note={span(t.scenarios.history_days)} />
                  <Stat label="Basis days" value={String(t.scenarios.basis_days.length)} size="sm" note={span(t.scenarios.basis_days)} />
                  <Stat
                    label="Forecast reference days"
                    value={String(t.forecast.reference_days.length)}
                    size="sm"
                    note={`${t.forecast.day_type} days, at least ${t.forecast.lag_days} days before the target`}
                  />
                </StatRow>
              </Section>
            </>
          );
        }}
      </Ready>
    </div>
  );
}
