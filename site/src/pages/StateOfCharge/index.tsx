import { SOURCE_LINE } from "../../config";
import { combine, type ArmName } from "../../data";
import { useDesk, useDeskCommon, type Desk, type DeskCommon } from "../../data/plan";
import { formatOperatingDay } from "../../lib/time";
import { BatteryBar, PageHeader, Ready, Section, Table, useBatteryChoice, type Column } from "../../ui";
import { allFigures, startSocMwh, type ArmFigures } from "../Battery/model";
import {
  Fact,
  Facts,
  Flow,
  HourContext,
  hourEnding,
  hourRange,
  HOURS,
  hourStart,
  Key,
  Legend,
  Meters,
  mw1,
  num2,
  pct1,
  PlanName,
  PLANS,
  planColor,
  ppmPct,
  Readout,
  SocChart,
  TabLink,
  useHour,
  useHourState,
  useNarrow,
  type SocLimits,
} from "../Battery/kit";
import "./styles.css";

// State of charge: how full the battery is at the end of every hour under each
// plan, inside the limits it must keep, and the cycles each plan spends. Three
// small charts share one scale, one per plan, so paths that coincide stay
// readable.

const TABLE_ID = "soc-hours";

interface HourRow {
  hour: number;
  soc: Partial<Record<ArmName, number>>;
}

function limitsOf(desk: Desk, common: DeskCommon): SocLimits {
  const e = desk.energyKwh / 1000;
  const a = common.assumptions;
  return {
    energyMwh: e,
    openMwh: startSocMwh(desk, common),
    minMwh: (e * a.soc_min_ppm) / 1e6,
    maxMwh: (e * a.soc_max_ppm) / 1e6,
    endFloorMwh: (e * a.soc_end_min_ppm) / 1e6,
  };
}

function describe(f: ArmFigures, h: number) {
  const kw = f.arm.kw[h] ?? 0;
  if (kw > 0) return `discharging ${mw1(kw / 1000)} MW`;
  if (kw < 0) return `charging ${mw1(-kw / 1000)} MW`;
  return "idle";
}

function SocReadout({ desk, figs, sealed }: { desk: Desk; figs: Partial<Record<ArmName, ArmFigures>>; sealed: ArmName }) {
  const { hour } = useHour();
  const e = desk.energyKwh / 1000;
  const plans = PLANS.filter((p) => figs[p]);
  if (hour === null) {
    return (
      <Readout
        when="End of the day"
        hint="Tap or point at a chart, or use the arrow keys on it, for one hour."
        values={plans.map((p) => ({
          key: p,
          label: `Plan ${p}${p === sealed ? ", sealed" : ""}`,
          value: mw1(figs[p]!.endSocMwh),
          unit: "MWh",
          sub: `${pct1(figs[p]!.endSocShare)}; lowest ${mw1(figs[p]!.minSocMwh)} MWh`,
          mark: { kind: "line" as const, plan: planColor(p) },
        }))}
      />
    );
  }
  return (
    <Readout
      when={hourRange(hour)}
      hint={`${hourEnding(hour)}, at the end of the hour`}
      values={plans.map((p) => ({
        key: p,
        label: `Plan ${p}${p === sealed ? ", sealed" : ""}`,
        value: mw1(figs[p]!.socMwh[hour]!),
        unit: "MWh",
        sub: `${pct1(figs[p]!.socMwh[hour]! / e)}, ${describe(figs[p]!, hour)}`,
        mark: { kind: "line" as const, plan: planColor(p) },
      }))}
    />
  );
}

export default function StateOfChargePage() {
  const choice = useBatteryChoice();
  const hourState = useHourState();
  const narrow = useNarrow();
  const all = combine(useDesk(choice.resource), useDeskCommon());

  return (
    <HourContext.Provider value={hourState}>
      <div className="page page--state">
        <PageHeader
          title="State of Charge"
          lede={
            <>
              How full the battery is at the end of every hour under each plan, inside the limits it has to keep.
              <Flow>
                It fits the schedule to the prices from <TabLink to="/agents/forecast">Forecast</TabLink>; <TabLink to="/agents/hedge">Hedge</TabLink> then adds contracts on top of
                that schedule.
              </Flow>
            </>
          }
        />
        <BatteryBar choice={choice} />
        <Ready state={all} label="Loading the plan">
          {([desk, common]) => {
            const figs = allFigures(desk, common);
            const plans = PLANS.filter((p) => figs[p]);
            const limits = limitsOf(desk, common);
            const a = common.assumptions;
            const e = desk.energyKwh / 1000;
            const p = desk.maxPowerKw / 1000;
            const day0 = formatOperatingDay(common.operatingDay);
            const cap = a.max_cycles_ppm / 1e6;
            const sealed = desk.selectedArm;
            const hourRows: HourRow[] = Array.from({ length: HOURS }, (_, h) => ({
              hour: h,
              soc: Object.fromEntries(plans.map((x) => [x, figs[x]!.socMwh[h]!])),
            }));
            const hourCols: Column<HourRow>[] = [
              { key: "hour", label: "Hour (CT)", kind: "number", align: "left", value: (r) => r.hour, render: (r) => (narrow ? hourStart(r.hour) : `${hourStart(r.hour)} · ${hourEnding(r.hour)}`) },
              ...plans.map(
                (x): Column<HourRow> => ({
                  key: x,
                  label: `Plan ${x}`,
                  kind: "number",
                  value: (r) => r.soc[x] ?? null,
                  render: (r) => (r.soc[x] == null ? "no value" : mw1(r.soc[x]!)),
                }),
              ),
            ];
            const planRows = plans.map((x) => figs[x]!);
            const allPlanCols: Column<ArmFigures>[] = [
              { key: "plan", label: "Plan", kind: "text", value: (f) => f.name, render: (f) => <PlanName plan={f.name} sealed={f.name === sealed} long={!narrow} /> },
              { key: "dis", label: narrow ? "Discharged" : "Discharged, MWh", kind: "number", value: (f) => f.dischargeMwh, render: (f) => mw1(f.dischargeMwh) },
              { key: "chg", label: "Charged, MWh", kind: "number", value: (f) => f.chargeMwh, render: (f) => mw1(f.chargeMwh) },
              { key: "cyc", label: "Cycles", kind: "number", value: (f) => f.cycles, render: (f) => num2(f.cycles) },
              { key: "min", label: "Lowest, MWh", kind: "number", value: (f) => f.minSocMwh, render: (f) => mw1(f.minSocMwh) },
              { key: "max", label: "Highest, MWh", kind: "number", value: (f) => f.maxSocMwh, render: (f) => mw1(f.maxSocMwh) },
              { key: "end", label: narrow ? "Ends at" : "Ends at, MWh", kind: "number", value: (f) => f.endSocMwh, render: (f) => (narrow ? mw1(f.endSocMwh) : `${mw1(f.endSocMwh)} (${pct1(f.endSocShare)})`) },
            ];
            // Phones keep the plan, its discharge, its cycles and where it ends.
            const planCols = narrow ? allPlanCols.filter((c) => ["plan", "dis", "cyc", "end"].includes(c.key)) : allPlanCols;
            return (
              <>
                <Section
                  className="soc-lead"
                  title="State of Charge by Plan"
                  lede={`MWh at the end of each hour, from ${mw1(limits.openMwh)} MWh at the start of ${day0}. Each chart draws one plan in its color and the others in gray, on one scale.`}
                  source={`${SOURCE_LINE} Operating day ${day0}, hours in CT. The shaded band is the operating range; the short line at the end is the closing floor.`}
                >
                  <div className="soc-readout">
                    <SocReadout desk={desk} figs={figs} sealed={sealed} />
                  </div>
                  <Legend>
                    <Key kind="ghost" label="The other plans, in gray" />
                    <Key kind="band" label={`Operating range, ${ppmPct(a.soc_min_ppm)} to ${ppmPct(a.soc_max_ppm)}`} />
                  </Legend>
                  <div className="pk-three soc-multiples">
                    {plans.map((x) => (
                      <SocChart
                        key={x}
                        title={<PlanName plan={x} sealed={x === sealed} />}
                        plan={x}
                        soc={figs[x]!.socMwh}
                        ghosts={plans.filter((o) => o !== x).map((o) => figs[o]!.socMwh)}
                        limits={limits}
                        height={210}
                        label={`Plan ${x} state of charge in MWh at the end of each hour, the other plans in gray`}
                        tableId={TABLE_ID}
                      />
                    ))}
                  </div>
                </Section>

                <div className="pk-two">
                  <Section title="Limits" source={`Battery: ERCOT resource records. Marked assumed: the plan's stated assumptions, the same for all ${common.batteries} batteries.`}>
                    <Facts>
                      <Fact label="Power" note="charge and discharge">
                        <span className="num">{mw1(p)} MW</span>
                      </Fact>
                      <Fact label="Energy" note={`${num2(e / p)} hours at full power`}>
                        <span className="num">{num2(e)} MWh</span>
                      </Fact>
                      <Fact label="Operating range" assumed={a.basis === "assumed"} note={`${mw1(limits.minMwh)} to ${mw1(limits.maxMwh)} MWh`}>
                        <span className="num">
                          {ppmPct(a.soc_min_ppm)} to {ppmPct(a.soc_max_ppm)}
                        </span>
                      </Fact>
                      <Fact label="Opens the day at" assumed={a.basis === "assumed"} note={`${mw1(limits.openMwh)} MWh`}>
                        <span className="num">{ppmPct(a.soc_open_ppm)}</span>
                      </Fact>
                      <Fact label="Ends the day at" assumed={a.basis === "assumed"} note={`${mw1(limits.endFloorMwh)} MWh or more`}>
                        <span className="num">at least {ppmPct(a.soc_end_min_ppm)}</span>
                      </Fact>
                      <Fact label="Round-trip efficiency" assumed={a.basis === "assumed"} note={`losses ${a.losses.replace(/^taken /, "")}`}>
                        <span className="num">{ppmPct(a.round_trip_ppm)}</span>
                      </Fact>
                    </Facts>
                  </Section>
                  <Section
                    title="Cycles Against the Cap"
                    lede={`Energy discharged over the day, in full cycles of ${num2(e)} MWh, against the cap of ${num2(cap)} a day.`}
                    source={`${SOURCE_LINE} Cycles: discharged MWh divided by the battery's energy.`}
                  >
                    <Meters
                      label="Cycles by plan against the daily cap"
                      rows={plans.map((x) => ({
                        key: x,
                        name: <PlanName plan={x} sealed={x === sealed} long={false} />,
                        share: figs[x]!.cycles / cap,
                        figure: `${num2(figs[x]!.cycles)} of ${num2(cap)}`,
                        plan: planColor(x),
                      }))}
                    />
                  </Section>
                </div>

                <Section title="The Three Plans" source={`${SOURCE_LINE} Operating day ${day0}. MWh at the end of each hour; discharged and charged over the day.`}>
                  <Table columns={planCols} rows={planRows} rowKey={(f) => f.name} isHighlighted={(f) => f.name === sealed} className="pk-sealed-rows pk-tight" />
                </Section>

                <Section title="Hour by Hour" lede="State of charge in MWh at the end of each hour, for each plan." source={`${SOURCE_LINE} Operating day ${day0}, hours in CT.`}>
                  <div id={TABLE_ID}>
                    <Table columns={hourCols} rows={hourRows} rowKey={(r) => String(r.hour)} dense className="pk-tight" />
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
