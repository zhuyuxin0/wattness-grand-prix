import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { SHOWCASE, SOURCE_LINE } from "../../config";
import { useDay, type ArmName } from "../../data";
import { arm as armTokens } from "../../design/tokens";
import { formatOperatingDay } from "../../lib/time";
import { useSelectedBattery } from "../../shell/battery";
import { BatteryPicker, ErrorNote, Loading, PageHeader, ParcFerme, Section } from "../../ui";
import { HourContext } from "./chart-kit";
import { ContractsChart, PriceChart, ScheduleChart, SocChart } from "./charts";
import { useDesk, useDeskCommon, type Desk } from "../../data/plan";
import { allFigures, ARM_ORDER, brief, HOURS, lambda, tailPercent } from "./model";
import { ArmControl, Compare, Engineer, HourTable, Mandate, Readout, Terms } from "./panels";
import { TeamData, WeatherRadar } from "./sponsors";
import "./styles.css";

// Battery: one battery's plan in full. Its three arms under the same inputs (A
// no hedge, B a hedge on A's schedule, C both chosen together). The URL carries
// the state, so any frame can be loaded directly:
// #/battery/DSWL_ESS_ESR1?arm=B&hour=17. The battery carries to the agent tabs.

const NAMES: Record<string, string> = { [SHOWCASE.resource]: SHOWCASE.name };
const TABLE_ID = "pw-hours";

const isArm = (v: string | null): v is ArmName => v === "A" || v === "B" || v === "C";

function methodText(m: string | null) {
  if (!m) return null;
  const s = m.replace(" - lambda * CVaR", " − λ × CVaR").replace(/^(\w+): /, "");
  return `${s[0]!.toUpperCase()}${s.slice(1)}.`;
}

/** The last desk that loaded, so switching batteries keeps the frame instead of flashing. */
function useHeldDesk(resource: string) {
  const state = useDesk(resource);
  const [held, setHeld] = useState<Desk | null>(null);
  useEffect(() => {
    if (state.status === "ready") setHeld(state.data);
  }, [state]);
  return { state, desk: state.status === "ready" ? state.data : held };
}

export default function BatteryPage() {
  const [params, setParams] = useSearchParams();
  const { "*": splat = "" } = useParams();
  const navigate = useNavigate();
  const [carried, carry] = useSelectedBattery();
  const day = useDay();
  const common = useDeskCommon();

  const batteries = day.status === "ready" ? day.data.batteries : [];
  const known = (r: string) => batteries.length === 0 || batteries.some((b) => b.resource === r);
  const asked = splat || params.get("battery") || carried;
  const resource = asked && known(asked) ? asked : SHOWCASE.resource;
  useEffect(() => {
    if (batteries.length > 0) carry(resource);
  }, [resource, batteries.length, carry]);
  const { state, desk } = useHeldDesk(resource);
  const stale = state.status === "loading" && desk !== null;

  const pinnedRaw = Number(params.get("hour"));
  const pinned = params.has("hour") && Number.isInteger(pinnedRaw) && pinnedRaw >= 0 && pinnedRaw < HOURS ? pinnedRaw : null;
  const [hover, setHover] = useState<number | null>(null);
  const hourState = useMemo(() => ({ hour: hover ?? pinned, setHour: setHover }), [hover, pinned]);

  const set = (patch: Record<string, string | null>, replace = true) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    setParams(next, { replace });
  };

  if (common.status === "error") return <ErrorNote error={common.error} />;
  if (state.status === "error" && !desk) return <ErrorNote error={state.error} />;
  if (common.status !== "ready" || !desk) return <Loading label="Loading the plan" />;

  const c = common.data;
  const figs = allFigures(desk, c);
  const available = ARM_ORDER.filter((a) => figs[a]);
  const askedArm = params.get("arm");
  const active: ArmName = isArm(askedArm) && figs[askedArm] ? askedArm : desk.selectedArm;
  const fig = figs[active]!;
  const name = NAMES[desk.resource];
  const lines = brief(desk, c, figs, active);
  const tail = tailPercent(c);

  return (
    <HourContext.Provider value={hourState}>
      <div className="page page--pit-wall" data-ready={stale ? undefined : "1"}>
        <PageHeader
          title={name ?? desk.resource}
          lede={`One battery, one set of inputs, three ways to run ${formatOperatingDay(c.operatingDay)}: no hedge, a hedge added to a fixed schedule, and schedule and hedge chosen together. Choose an arm and every chart and figure follows.`}
          aside={
            <div className="pw-head-aside">
              <ParcFerme state="sealed" />
              <div className="pw-head-aside__line">
                Arm <strong>{desk.selectedArm}</strong> sealed, {armTokens[desk.selectedArm].label.toLowerCase()}
              </div>
            </div>
          }
        />

        <div className="pw-toolbar">
          <BatteryPicker batteries={batteries} value={desk.resource} names={NAMES} onChange={(r) => {
              const next = new URLSearchParams(params);
              for (const k of ["battery", "arm", "hour"]) next.delete(k);
              navigate({ pathname: `/battery/${r}`, search: next.toString() });
            }} />
          <div className="pw-toolbar__arms">
            <span className="pw-toolbar__label">Arm</span>
            <ArmControl value={active} sealed={desk.selectedArm} available={available} onChange={(a) => set({ arm: a === desk.selectedArm ? null : a })} />
          </div>
        </div>

        <div className={`pw-grid${stale ? " is-stale" : ""}`} aria-busy={stale}>
          <aside className="pw-col pw-col--left" aria-label="Asset and mandate">
            <Section kicker="The asset" title="Asset and mandate" source="Battery: ERCOT resource records. Mandate: the plan's stated assumptions.">
              <Mandate desk={desk} common={c} name={name} />
            </Section>
            <Section kicker="The hedge" title="Published terms">
              <Terms desk={desk} common={c} />
            </Section>
          </aside>

          <div className="pw-col pw-col--center">
            <Section
              title={
                <>
                  <span className="pw-arm-dot" style={{ background: armTokens[active].color }} aria-hidden="true" />
                  Arm {active}: {armTokens[active].label}
                </>
              }
              lede={methodText(c.armMethods[active])}
              source={`${SOURCE_LINE} Operating day ${formatOperatingDay(c.operatingDay)}, hours in CT. Forecast by day-type persistence of day-ahead hub prices plus the node's basis; ${c.scenarios.count} equally weighted price scenarios. Hedge contracts are a scenario comparison at an assumed entry, never executed trades.`}
            >
              <Readout desk={desk} common={c} fig={fig} />
              <div className="pw-stack">
                <div className="pw-block">
                  <h3 className="pw-block__title">
                    Price outlook <span className="pw-block__unit">$/MWh</span>
                  </h3>
                  <PriceChart desk={desk} common={c} tableId={TABLE_ID} />
                </div>
                <div className="pw-block">
                  <h3 className="pw-block__title">
                    Schedule <span className="pw-block__unit">MW, arm {active}</span>
                  </h3>
                  <ScheduleChart desk={desk} fig={fig} tableId={TABLE_ID} />
                </div>
                <div className="pw-block">
                  <h3 className="pw-block__title">
                    State of charge <span className="pw-block__unit">MWh at the end of each hour</span>
                  </h3>
                  <SocChart desk={desk} common={c} figs={figs} active={active} tableId={TABLE_ID} />
                </div>
                <div className="pw-block">
                  <h3 className="pw-block__title">
                    Hedge <span className="pw-block__unit">contracts by hour, arm {active}; 1 MWh each at {desk.hub}</span>
                  </h3>
                  <ContractsChart fig={fig} figs={figs} tableId={TABLE_ID} />
                </div>
              </div>
              <details className="pw-details" open={params.get("table") === "1" || undefined}>
                <summary>Hour by hour, arm {active}</summary>
                <HourTable id={TABLE_ID} desk={desk} common={c} fig={fig} />
              </details>
            </Section>
          </div>

          <aside className="pw-col pw-col--right" aria-label="The arms compared">
            <Section
              kicker="Strategy"
              title="Arms compared"
              source={`Over ${c.scenarios.count} equally weighted scenarios. Expected revenue splits into energy sold and bought at the node, wear, the hedge's settlement against the assumed entry, and fees. Downside: the mean revenue of the worst ${tail}% (CVaR at ${100 - tail}% of loss, sign flipped); the objective takes ${lambda(c)} × CVaR. ${SOURCE_LINE}`}
            >
              <Compare common={c} figs={figs} active={active} sealed={desk.selectedArm} onPick={(a) => set({ arm: a === desk.selectedArm ? null : a })} />
            </Section>
            <Section title="What differs between the arms" variant="panel" className="pw-panel">
              <Engineer lines={lines} count={c.scenarios.count} />
            </Section>
            <WeatherRadar resource={desk.resource} />
            <TeamData resource={desk.resource} />
          </aside>
        </div>
      </div>
    </HourContext.Provider>
  );
}
