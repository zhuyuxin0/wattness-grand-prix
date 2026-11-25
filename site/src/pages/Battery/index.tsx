import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { SHOWCASE, SOURCE_LINE } from "../../config";
import { useDay, type ArmName } from "../../data";
import { useDesk, useDeskCommon, type Desk } from "../../data/plan";
import { formatOperatingDay } from "../../lib/time";
import { useSelectedBattery } from "../../shell/battery";
import { BATTERY_NAMES, BatteryPicker, ErrorNote, Glyph, Loading, PageHeader, Section } from "../../ui";
import { ColumnsChart, FanChart, Flow, HourContext, HOURS, Key, Legend, PlanSeg, planLabel, SocChart, TabLink, useHourState } from "./kit";
import { allFigures, ARM_ORDER, differences, startSocMwh, tailPercent } from "./model";
import { Asset, Compare, Differences, HourReadout, HourTable, Lead, Record } from "./panels";
import "./styles.css";

// Battery: one battery's plan in full. The sealed plan leads; below it the
// plan by hour (any of the three can be shown), the three plans compared, and
// the asset with its limits. The URL carries the state, so any frame loads
// directly: #/battery/DSWL_ESS_ESR1?arm=B&hour=17. The battery carries to the
// agent tabs.

const TABLE_ID = "bt-hours";

const isArm = (v: string | null): v is ArmName => v === "A" || v === "B" || v === "C";

/** The last plan that loaded, so switching batteries keeps the frame instead of flashing. */
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
  const hourState = useHourState(pinned);

  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    setParams(next, { replace: true });
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
  const sealedFig = figs[desk.selectedArm] ?? fig;
  const name = BATTERY_NAMES[desk.resource];
  const day0 = formatOperatingDay(c.operatingDay);
  const tail = tailPercent(c);
  const e = desk.energyKwh / 1000;
  const limits = {
    energyMwh: e,
    openMwh: startSocMwh(desk, c),
    minMwh: (e * c.assumptions.soc_min_ppm) / 1e6,
    maxMwh: (e * c.assumptions.soc_max_ppm) / 1e6,
    endFloorMwh: (e * c.assumptions.soc_end_min_ppm) / 1e6,
  };
  let maxQ = 1;
  for (const a of available) for (const q of figs[a]!.arm.contracts) maxQ = Math.max(maxQ, Math.abs(q));
  const pick = (a: ArmName) => set({ arm: a === desk.selectedArm ? null : a });
  const planVar = `var(--arm-${active.toLowerCase()})`;

  return (
    <HourContext.Provider value={hourState}>
      <div className="page page--battery" data-ready={stale ? undefined : "1"}>
        <PageHeader
          title={
            name ? (
              <>
                {name} <span className="bt-code">({desk.resource})</span>
              </>
            ) : (
              <span className="bt-code bt-code--title">{desk.resource}</span>
            )
          }
          lede={
            <>
              This battery's plan for {day0}: three ways to run it against the same prices, and the one that was sealed.
              <Flow>
                Picked from <TabLink to="/fleet">Fleet</TabLink>. <TabLink to="/agents/forecast">Forecast</TabLink> through <TabLink to="/agents/risk">Risk</TabLink> show how
                each part was made; <TabLink to="/seal">Seal</TabLink> shows it committed.
              </Flow>
            </>
          }
        />

        <div className="pk-toolbar bt-toolbar" role="group" aria-label="Battery and plan">
          <BatteryPicker
            batteries={batteries}
            value={desk.resource}
            names={BATTERY_NAMES}
            onChange={(r) => {
              const next = new URLSearchParams(params);
              for (const k of ["battery", "arm", "hour"]) next.delete(k);
              navigate({ pathname: `/battery/${r}`, search: next.toString() });
            }}
          />
          <div className="pk-toolbar__group">
            <span className="pk-toolbar__label">Show</span>
            <PlanSeg value={active} sealed={desk.selectedArm} available={available} onChange={pick} />
          </div>
        </div>

        <div className={`bt-body${stale ? " is-stale" : ""}`} aria-busy={stale}>
          <Lead common={c} fig={sealedFig} />

          <div className="bt-grid">
            <Section
              className="bt-plan"
              title={`Plan ${active} by Hour`}
              lede={`${planLabel(active)}${active === desk.selectedArm ? ", the sealed plan" : ""}. Every chart shares the hour axis, so a column lines up across all four.`}
              source={`${SOURCE_LINE} Operating day ${day0}, hours in CT. Prices: day-ahead forecast at ${desk.settlementPoint} and its ${c.scenarios.count} equally weighted scenarios. Contracts are a comparison at an assumed entry price, not executed trades.`}
            >
              <div className="bt-readout">
                <HourReadout desk={desk} common={c} fig={fig} />
              </div>
              <div className="pk-stack bt-charts">
                <FanChart
                  title="Price Outlook"
                  unit={`$/MWh at ${desk.settlementPoint}`}
                  legend={
                    <Legend>
                      <Key kind="line" label="Forecast the plan used" />
                      <Key kind="band-inner" label="Middle half of scenarios" />
                      <Key kind="band" label="5th to 95th percentile" />
                    </Legend>
                  }
                  forecast={desk.nodeForecastCents}
                  bands={desk.nodeScenarioCents}
                  label={`Price outlook at ${desk.settlementPoint} in dollars per MWh by hour: the forecast and the spread of the scenarios`}
                  tableId={TABLE_ID}
                  height={200}
                />
                <ColumnsChart
                  title="Schedule"
                  unit={`MW, plan ${active}; the lines mark the battery's ${Math.round(desk.maxPowerKw / 1000)} MW limit`}
                  values={fig.mw}
                  plan={active}
                  maxAbs={desk.maxPowerKw / 1000}
                  limit={desk.maxPowerKw / 1000}
                  up="Discharge"
                  down="Charge"
                  label={`Plan ${active} schedule in MW by hour: discharge above zero, charge below`}
                  tableId={TABLE_ID}
                  height={190}
                />
                <SocChart
                  title="State of Charge"
                  unit="MWh at the end of each hour"
                  legend={
                    <Legend>
                      <Key kind="line" plan={planVar} label={`Plan ${active}`} />
                      <Key kind="ghost" label="The other plans" />
                      <Key kind="band" label={`Operating range, ${Math.round(c.assumptions.soc_min_ppm / 1e4)}% to ${Math.round(c.assumptions.soc_max_ppm / 1e4)}%`} />
                    </Legend>
                  }
                  plan={active}
                  soc={fig.socMwh}
                  ghosts={available.filter((a) => a !== active).map((a) => figs[a]!.socMwh)}
                  limits={limits}
                  label={`State of charge in MWh at the end of each hour, plan ${active}, with the other plans in gray`}
                  tableId={TABLE_ID}
                  height={190}
                />
                <ColumnsChart
                  title="Hedge"
                  unit={`contracts of 1 MWh at ${desk.hub}, plan ${active}`}
                  values={fig.arm.contracts}
                  plan={active}
                  maxAbs={maxQ}
                  up="Sell"
                  down="Buy"
                  empty={`Plan ${active} holds no contracts`}
                  label={`Plan ${active} hedge in contracts by hour: sold above zero, bought below`}
                  tableId={TABLE_ID}
                  height={150}
                />
              </div>
              <details className="pk-details bt-table" open={params.get("table") === "1" || undefined}>
                <summary>
                  <Glyph name="fold" className="pk-details__closed" />
                  <Glyph name="fold-open" className="pk-details__open" />
                  Plan {active} hour by hour
                </summary>
                <HourTable id={TABLE_ID} desk={desk} common={c} fig={fig} />
              </details>
            </Section>

            <div className="bt-side">
              <Section
                title="The Three Plans Compared"
                lede="Same battery, same prices. Choose a plan's column to show it."
                source={`Means over ${c.scenarios.count} equally weighted scenarios, in dollars for the day. Worst ${tail}%: the mean revenue of the worst ${tail}% of scenarios. ${SOURCE_LINE}`}
              >
                <Compare common={c} figs={figs} active={active} sealed={desk.selectedArm} onPick={pick} />
              </Section>
              <Section title="What Differs" source="Written by fixed rules from this battery's sealed plan; every figure is the plan's own.">
                <Differences lines={differences(desk, c, figs)} />
              </Section>
            </div>
          </div>

          <Section
            title="Asset and Limits"
            lede={`The battery as ERCOT records it, and the limits every plan keeps. Contract terms are on the Hedge tab.`}
            source={`Battery: ERCOT resource records. Marked assumed: the plan's stated assumptions, the same for all ${c.batteries} batteries. ${c.physicalScope.replace(/^./, (s) => s.toUpperCase())}.`}
          >
            <Asset desk={desk} common={c} />
          </Section>

          <Section title="Record" source={`The leaf is this plan's hash inside the root committed to BNB Smart Chain. ${SOURCE_LINE}`}>
            <Record desk={desk} common={c} />
          </Section>
        </div>
      </div>
    </HourContext.Provider>
  );
}
