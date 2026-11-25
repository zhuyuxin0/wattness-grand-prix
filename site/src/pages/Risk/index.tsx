import { SOURCE_LINE } from "../../config";
import { combine, type ArmName } from "../../data";
import { useDesk, useDeskCommon, type DeskArm } from "../../data/plan";
import { arm as armMeta } from "../../design/tokens";
import { formatUsd } from "../../lib/format";
import { formatOperatingDay } from "../../lib/time";
import { BatteryBar, PageHeader, Ready, Section, Stat, StatRow, Table, useBatteryChoice, type Column } from "../../ui";

// Risk: each plan's downside over the price scenarios, the objective that
// weighs it against the mean, and the parts of the mean that move it.

const ARMS: ArmName[] = ["A", "B", "C"];

interface Row {
  name: ArmName;
  arm: DeskArm;
  sealed: boolean;
}

const money = (v: number | null | undefined) => (v == null ? "no value" : formatUsd(v));

export default function RiskPage() {
  const choice = useBatteryChoice();
  const all = combine(useDesk(choice.resource), useDeskCommon());

  return (
    <div className="page page--risk">
      <PageHeader
        title="Risk"
        lede="Each plan is scored on its mean revenue over the price scenarios less a charge for its worst outcomes. The plan with the highest score is the one sealed."
      />
      <BatteryBar choice={choice} />
      <Ready state={all}>
        {([desk, common]) => {
          const alpha = common.risk.alpha_ppm / 1e6;
          const lambda = common.risk.lambda_ppm / 1e6;
          const tail = Math.round((1 - alpha) * 100);
          const rows: Row[] = ARMS.flatMap((x) => (desk.arms[x] ? [{ name: x, arm: desk.arms[x]!, sealed: x === desk.selectedArm }] : []));
          const cols: Column<Row>[] = [
            { key: "plan", label: "Plan", kind: "text", value: (r) => r.name, render: (r) => `${r.name}: ${armMeta[r.name].label}${r.sealed ? " (sealed)" : ""}` },
            { key: "mean", label: "Mean revenue", kind: "number", value: (r) => r.arm.expectedUsd, render: (r) => money(r.arm.expectedUsd) },
            { key: "tail", label: `Worst ${tail}%, mean`, title: `Mean revenue over the worst ${tail}% of scenarios`, kind: "number", value: (r) => -r.arm.cvarUsd, render: (r) => money(-r.arm.cvarUsd) },
            { key: "objective", label: "Score", title: `Mean − ${lambda} × CVaR of loss`, kind: "number", value: (r) => r.arm.objectiveUsd, render: (r) => money(r.arm.objectiveUsd) },
            { key: "energy", label: "Energy", kind: "number", value: (r) => r.arm.split?.energyUsd ?? null, render: (r) => money(r.arm.split?.energyUsd) },
            { key: "wear", label: "Wear", kind: "number", value: (r) => r.arm.split?.wearUsd ?? null, render: (r) => money(r.arm.split?.wearUsd) },
            { key: "hedge", label: "Hedge", kind: "number", value: (r) => r.arm.split?.hedgeUsd ?? null, render: (r) => money(r.arm.split?.hedgeUsd) },
            { key: "fees", label: "Fees", kind: "number", value: (r) => r.arm.split?.feesUsd ?? null, render: (r) => money(r.arm.split?.feesUsd) },
          ];
          const sealed = desk.arms[desk.selectedArm];
          return (
            <>
              {sealed && (
                <Section title={`Plan ${desk.selectedArm}, sealed`} source={`${SOURCE_LINE} Over ${common.scenarios.count} equally weighted scenarios.`}>
                  <StatRow>
                    <Stat label="Mean revenue" value={money(sealed.expectedUsd)} note="over every scenario" />
                    <Stat label={`Worst ${tail}% of scenarios`} value={money(-sealed.cvarUsd)} note={`mean revenue there: CVaR at ${Math.round(alpha * 100)}% of loss, sign flipped`} />
                    <Stat label="Score" value={money(sealed.objectiveUsd)} note={`mean − ${lambda} × CVaR of loss`} />
                  </StatRow>
                </Section>
              )}
              <Section
                title="The three plans compared"
                lede="The mean splits into energy sold and bought at the node, the wear charge, the hedge's settlement against its assumed entry, and fees."
                source={`${SOURCE_LINE} Operating day ${formatOperatingDay(common.operatingDay)}. ${common.selectionRule.replace(/^./, (c) => c.toUpperCase())}.`}
              >
                <Table columns={cols} rows={rows} rowKey={(r) => r.name} />
              </Section>
            </>
          );
        }}
      </Ready>
    </div>
  );
}
