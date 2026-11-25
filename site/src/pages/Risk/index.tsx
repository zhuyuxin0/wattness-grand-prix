import { useState } from "react";
import { SOURCE_LINE } from "../../config";
import { combine, type ArmName } from "../../data";
import { useDesk, useDeskCommon } from "../../data/plan";
import { formatOperatingDay } from "../../lib/time";
import { BatteryBar, Glyph, PageHeader, Ready, Section, Stat, StatRow, Table, useBatteryChoice, type Column } from "../../ui";
import { allFigures, lambda, scoreFormula, tailPercent, type ArmFigures } from "../Battery/model";
import { count, delta, Fact, Facts, Flow, Key, Legend, money, moneyWords, num2, planColor, PlanName, PLANS, Readout, TabLink, useNarrow } from "../Battery/kit";
import { Dumbbell, type Bell } from "./Dumbbell";
import "./styles.css";

// Risk: each plan's downside over the price scenarios, the score that weighs
// it against the mean, and what moved it from one plan to the next. The plan
// with the highest score is the one sealed.

interface Step {
  key: string;
  from: ArmFigures;
  to: ArmFigures;
  what: string;
}

const part = (f: ArmFigures, k: "energyUsd" | "wearUsd" | "hedgeUsd" | "feesUsd") => (f.arm.split ? f.arm.split[k] : null);
const dPart = (s: Step, k: "energyUsd" | "wearUsd" | "hedgeUsd" | "feesUsd") => {
  const a = part(s.from, k);
  const b = part(s.to, k);
  return a == null || b == null ? null : b - a;
};
const show = (v: number | null) => (v == null ? "no value" : delta(v));

export default function RiskPage() {
  const choice = useBatteryChoice();
  const all = combine(useDesk(choice.resource), useDeskCommon());
  const [active, setActive] = useState<ArmName | null>(null);
  const narrow = useNarrow();

  return (
    <div className="page page--risk">
      <PageHeader
        title="Risk"
        lede={
          <>
            How each plan does in the worst of the price scenarios, and the score that weighs that against its mean. The highest score is sealed.
            <Flow>
              It scores the plans from <TabLink to="/agents/state">State of Charge</TabLink> and <TabLink to="/agents/hedge">Hedge</TabLink> over the{" "}
              <TabLink to="/agents/forecast">Forecast</TabLink> scenarios; <TabLink to="/seal">Seal</TabLink> shows the plan it picked, committed on BNB Chain.
            </Flow>
          </>
        }
      />
      <BatteryBar choice={choice} />
      <Ready state={all} label="Loading the plans">
        {([desk, common]) => {
          const figs = allFigures(desk, common);
          const plans = PLANS.filter((p) => figs[p]);
          const sealed = desk.selectedArm;
          const S = figs[sealed]!;
          const tail = tailPercent(common);
          const lam = lambda(common);
          const day0 = formatOperatingDay(common.operatingDay);
          const n = common.scenarios.count;
          const runnerUp = plans.filter((p) => p !== sealed).sort((a, b) => figs[b]!.arm.objectiveUsd - figs[a]!.arm.objectiveUsd)[0];
          const bells: Bell[] = plans.map((p) => ({ plan: p, sealed: p === sealed, tail: figs[p]!.tailUsd, mean: figs[p]!.arm.expectedUsd, score: figs[p]!.arm.objectiveUsd }));
          const shown = figs[active ?? sealed]!;
          const steps: Step[] = [];
          if (figs.A && figs.B) steps.push({ key: "AB", from: figs.A, to: figs.B, what: "The hedge added to A's schedule" });
          if (figs.B && figs.C) steps.push({ key: "BC", from: figs.B, to: figs.C, what: "The schedule chosen with the hedge" });
          else if (figs.A && figs.C) steps.push({ key: "AC", from: figs.A, to: figs.C, what: "Schedule and hedge chosen together" });

          const stepCols: Column<Step>[] = [
            {
              key: "step",
              label: "From, to",
              sortable: false,
              value: (s) => s.key,
              render: (s) => (
                <span className="rk-step">
                  <span className="num">
                    {s.from.name} to {s.to.name}
                  </span>
                  {!narrow && <span className="muted">{s.what}</span>}
                </span>
              ),
            },
            { key: "energy", label: "Energy", kind: "number", sortable: false, value: (s) => dPart(s, "energyUsd"), render: (s) => show(dPart(s, "energyUsd")) },
            { key: "wear", label: "Wear", kind: "number", sortable: false, value: (s) => dPart(s, "wearUsd"), render: (s) => show(dPart(s, "wearUsd")) },
            { key: "hedge", label: "Hedge", kind: "number", sortable: false, value: (s) => dPart(s, "hedgeUsd"), render: (s) => show(dPart(s, "hedgeUsd")) },
            { key: "fees", label: "Fees", kind: "number", sortable: false, value: (s) => dPart(s, "feesUsd"), render: (s) => show(dPart(s, "feesUsd")) },
            { key: "mean", label: "Mean", kind: "number", sortable: false, value: (s) => s.to.arm.expectedUsd - s.from.arm.expectedUsd, render: (s) => delta(s.to.arm.expectedUsd - s.from.arm.expectedUsd) },
            { key: "tail", label: `Worst ${tail}%`, kind: "number", sortable: false, value: (s) => s.to.tailUsd - s.from.tailUsd, render: (s) => delta(s.to.tailUsd - s.from.tailUsd) },
            {
              key: "score",
              label: "Score",
              kind: "number",
              sortable: false,
              value: (s) => s.to.arm.objectiveUsd - s.from.arm.objectiveUsd,
              render: (s) => <strong>{delta(s.to.arm.objectiveUsd - s.from.arm.objectiveUsd)}</strong>,
            },
          ];

          const planCols: Column<ArmFigures>[] = [
            { key: "plan", label: "Plan", kind: "text", value: (f) => f.name, render: (f) => <PlanName plan={f.name} sealed={f.name === sealed} long={!narrow} /> },
            { key: "mean", label: narrow ? "Mean" : "Mean revenue", kind: "number", value: (f) => f.arm.expectedUsd, render: (f) => money(f.arm.expectedUsd) },
            { key: "tail", label: `Worst ${tail}%`, title: `Mean revenue over the worst ${tail}% of scenarios`, kind: "number", value: (f) => f.tailUsd, render: (f) => money(f.tailUsd) },
            { key: "score", label: "Score", title: scoreFormula(common), kind: "number", value: (f) => f.arm.objectiveUsd, render: (f) => money(f.arm.objectiveUsd) },
            { key: "energy", label: "Energy", kind: "number", value: (f) => part(f, "energyUsd"), render: (f) => (part(f, "energyUsd") == null ? "no value" : money(part(f, "energyUsd")!)) },
            { key: "wear", label: "Wear", kind: "number", value: (f) => part(f, "wearUsd"), render: (f) => (part(f, "wearUsd") == null ? "no value" : money(part(f, "wearUsd")!)) },
            { key: "hedge", label: "Hedge", kind: "number", value: (f) => part(f, "hedgeUsd"), render: (f) => (part(f, "hedgeUsd") == null ? "no value" : money(part(f, "hedgeUsd")!)) },
            { key: "fees", label: "Fees", kind: "number", value: (f) => part(f, "feesUsd"), render: (f) => (part(f, "feesUsd") == null ? "no value" : money(part(f, "feesUsd")!)) },
            { key: "contracts", label: "Contracts", kind: "number", value: (f) => f.contracts, render: (f) => count(f.contracts) },
          ];

          // Phones keep what the table is for: the steps' totals, and the parts by plan.
          const stepShown = narrow ? stepCols.filter((c) => ["step", "mean", "tail", "score"].includes(c.key)) : stepCols;
          const partShown = narrow ? planCols.filter((c) => ["plan", "energy", "wear", "hedge", "fees"].includes(c.key)) : planCols;

          return (
            <>
              <section className="pk-lead rk-lead" aria-label="The sealed plan's score">
                <div className="pk-lead__line">
                  <span className="pk-lead__state">
                    <Glyph name="seal" />
                    Sealed
                  </span>
                  <PlanName plan={sealed} />
                </div>
                <div className="pk-lead__figure">
                  <div className="pk-lead__value num">{money(S.arm.objectiveUsd)}</div>
                  <p className="pk-lead__caption">
                    {runnerUp && figs[runnerUp]!.arm.objectiveUsd === S.arm.objectiveUsd
                      ? `Its score, level with plan ${runnerUp}'s; a tie goes to the earlier plan.`
                      : `Its score, the highest of the ${plans.length}${runnerUp ? `, ${money(S.arm.objectiveUsd - figs[runnerUp]!.arm.objectiveUsd)} above plan ${runnerUp}` : ""}.`}{" "}
                    The score is mean revenue minus {num2(lam)} × the average loss in the worst {tail}% of {count(n)} scenarios.
                  </p>
                </div>
                <StatRow>
                  <Stat label="Mean revenue" value={money(S.arm.expectedUsd)} note={`over all ${count(n)} scenarios`} />
                  <Stat label={`Worst ${tail}% of scenarios`} value={money(S.tailUsd)} note="mean revenue across them" />
                  <Stat label="Downside term" value={delta(S.arm.objectiveUsd - S.arm.expectedUsd)} note={`−${num2(lam)} × CVaR of loss, which is ${moneyWords(S.arm.cvarUsd)}`} />
                </StatRow>
              </section>

              <Section
                title="Mean and Worst Case by Plan"
                lede={`Each row runs from the plan's worst-${tail}% average to its mean revenue; the tick is its score. The further left a row starts, the more its score gives up.`}
                source={`${SOURCE_LINE} Operating day ${day0}. Over ${count(n)} equally weighted price scenarios.`}
              >
                <Readout
                  className="rk-readout"
                  when={<PlanName plan={shown.name} sealed={shown.name === sealed} />}
                  hint={active ? undefined : "Point at a row, or focus one, for another plan."}
                  values={[
                    { key: "tail", label: `Worst ${tail}%`, value: money(shown.tailUsd), sub: "mean revenue there", mark: { kind: "line", plan: planColor(shown.name) } },
                    { key: "mean", label: "Mean revenue", value: money(shown.arm.expectedUsd), sub: "over all scenarios", mark: { kind: "dot", plan: planColor(shown.name) } },
                    { key: "score", label: "Score", value: money(shown.arm.objectiveUsd), sub: scoreFormula(common), mark: { kind: "tick" } },
                  ]}
                />
                <Legend>
                  <Key kind="ring" label={`Worst ${tail}%, mean revenue`} />
                  <Key kind="dot" label="Mean revenue" />
                  <Key kind="tick" label="Score" />
                </Legend>
                <Dumbbell rows={bells} active={active} onActive={setActive} label={`Each plan's worst-${tail}% average revenue, mean revenue and score, in dollars`} />
                {narrow && (
                  <Table
                    columns={planCols.filter((c) => ["plan", "mean", "tail", "score"].includes(c.key))}
                    rows={plans.map((p) => figs[p]!)}
                    rowKey={(f) => f.name}
                    isHighlighted={(f) => f.name === sealed}
                    className="pk-sealed-rows pk-tight"
                  />
                )}
              </Section>

              <Section
                title="What Moved It"
                lede="The change from one plan to the next, part by part. Energy, wear, hedge and fees add up to the change in the mean."
                source={`${SOURCE_LINE} Parts of the mean: energy sold and bought at the node, the wear charge, the hedge's settlement against its assumed entry, and fees.`}
              >
                <Table columns={stepShown} rows={steps} rowKey={(s) => s.key} className="pk-tight" />
              </Section>

              <Section title="How the Score Works" source={`The plan's stated method, the same for all ${common.batteries} batteries.`}>
                <Facts className="rk-method">
                  <Fact label="Downside measure" note={`CVaR at ${100 - tail}%`}>
                    The average loss over the worst {tail}% of scenarios
                  </Fact>
                  <Fact label="Weight on the downside">
                    <span className="num">{num2(lam)}</span>
                  </Fact>
                  <Fact label="Score">
                    <span className="num">{scoreFormula(common)}</span>
                  </Fact>
                  <Fact label="Scenarios" note="from Forecast">
                    <span className="num">{count(n)}, equally weighted</span>
                  </Fact>
                  <Fact label="Which plan is sealed" note="a tie goes to the earlier plan">
                    The highest score
                  </Fact>
                </Facts>
              </Section>

              <Section
                title="Every Part of the Mean"
                lede={narrow ? "Energy, wear, hedge and fees by plan; they add up to each plan's mean revenue." : undefined}
                source={`${SOURCE_LINE} Operating day ${day0}. Means over ${count(n)} scenarios, in dollars for the day. The plan with the highest score is sealed; a tie goes to the earlier plan.`}
              >
                <Table columns={partShown} rows={plans.map((p) => figs[p]!)} rowKey={(f) => f.name} isHighlighted={(f) => f.name === sealed} className="pk-sealed-rows pk-tight" />
              </Section>
            </>
          );
        }}
      </Ready>
    </div>
  );
}
