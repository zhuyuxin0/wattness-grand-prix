import { SOURCE_LINE } from "../../config";
import { combine, type ArmName } from "../../data";
import { useDesk, useDeskCommon, type Desk } from "../../data/plan";
import { arm as armMeta } from "../../design/tokens";
import { formatDec1 } from "../../lib/format";
import { hourEndingLabel, hourStartLabel, HOURS_OF_DAY } from "../../lib/hours";
import { formatOperatingDay } from "../../lib/time";
import { BatteryBar, PageHeader, Ready, Section, Stat, StatRow, Table, useBatteryChoice, type Column } from "../../ui";

// State of charge: what the battery can hold and how full each plan keeps it,
// hour by hour, with the cycles each plan spends.

const ARMS: ArmName[] = ["A", "B", "C"];
const pct = (ppm: number) => `${formatDec1(ppm / 1e4)}%`;

interface Row {
  hour: number;
  soc: Partial<Record<ArmName, number>>;
}

function rows(desk: Desk): Row[] {
  return HOURS_OF_DAY.map((h) => ({
    hour: h,
    soc: Object.fromEntries(ARMS.flatMap((a) => (desk.arms[a] ? [[a, desk.arms[a]!.socKwh[h]!]] : []))),
  }));
}

function dischargeMwh(desk: Desk, a: ArmName): number | null {
  const kw = desk.arms[a]?.kw;
  return kw ? kw.reduce((s, v) => s + Math.max(0, v), 0) / 1000 : null;
}

export default function StateOfChargePage() {
  const choice = useBatteryChoice();
  const all = combine(useDesk(choice.resource), useDeskCommon());

  return (
    <div className="page page--state">
      <PageHeader
        title="State of Charge"
        lede="Each plan keeps the battery inside its power and energy limits every hour. The state of charge is the energy stored at the end of each hour."
      />
      <BatteryBar choice={choice} />
      <Ready state={all}>
        {([desk, common]) => {
          const a = common.assumptions;
          const energy = desk.energyKwh / 1000;
          const arms = ARMS.filter((x) => desk.arms[x]);
          const cols: Column<Row>[] = [
            { key: "hour", label: "Hour (CT)", kind: "number", align: "left", value: (r) => r.hour, render: (r) => `${hourStartLabel(r.hour)} · ${hourEndingLabel(r.hour)}` },
            ...arms.map(
              (x): Column<Row> => ({
                key: x,
                label: `Plan ${x}, MWh`,
                title: armMeta[x].label,
                kind: "number",
                value: (r) => (r.soc[x] == null ? null : r.soc[x]! / 1000),
                render: (r) => (r.soc[x] == null ? "no value" : formatDec1(r.soc[x]! / 1000)),
              }),
            ),
          ];
          return (
            <>
              <Section title="Limits" source="Battery: ERCOT resource records. Limits: the plan's stated assumptions.">
                <StatRow>
                  <Stat label="Power" value={formatDec1(desk.maxPowerKw / 1000)} unit="MW" note="charge and discharge" />
                  <Stat label="Energy" value={formatDec1(energy)} unit="MWh" note="storage capacity" />
                  <Stat label="Charge kept between" value={`${pct(a.soc_min_ppm)} and ${pct(a.soc_max_ppm)}`} size="sm" note={`opens the day at ${pct(a.soc_open_ppm)}, ends at least ${pct(a.soc_end_min_ppm)}`} />
                  <Stat label="Round trip" value={pct(a.round_trip_ppm)} size="sm" note={`at most ${formatDec1(a.max_cycles_ppm / 1e6)} cycles a day`} />
                </StatRow>
              </Section>
              <Section title="Cycles by plan" source={`${SOURCE_LINE} Cycles: planned discharge over the day divided by the battery's energy.`}>
                <StatRow>
                  {arms.map((x) => {
                    const d = dischargeMwh(desk, x);
                    return (
                      <Stat
                        key={x}
                        label={`Plan ${x}: ${armMeta[x].label.toLowerCase()}`}
                        value={d == null ? "no value" : formatDec1(d / energy)}
                        unit="cycles"
                        size="sm"
                        note={d == null ? undefined : `${formatDec1(d)} MWh discharged${x === desk.selectedArm ? ", sealed" : ""}`}
                      />
                    );
                  })}
                </StatRow>
              </Section>
              <Section
                title="State of charge by hour"
                lede={`At the end of each hour, in MWh, for each plan. Plan ${desk.selectedArm} is the one sealed.`}
                source={`${SOURCE_LINE} Operating day ${formatOperatingDay(common.operatingDay)}, hours in CT.`}
              >
                <Table columns={cols} rows={rows(desk)} rowKey={(r) => String(r.hour)} dense />
              </Section>
            </>
          );
        }}
      </Ready>
    </div>
  );
}
