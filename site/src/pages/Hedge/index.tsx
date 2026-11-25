import { SOURCE_LINE } from "../../config";
import { combine, type ArmName } from "../../data";
import { useDesk, useDeskCommon, type Desk } from "../../data/plan";
import { arm as armMeta } from "../../design/tokens";
import { formatInt, formatUsd } from "../../lib/format";
import { dollarsPerMwh, hourEndingLabel, hourStartLabel, HOURS_OF_DAY } from "../../lib/hours";
import { formatOperatingDay } from "../../lib/time";
import { BatteryBar, Glyph, PageHeader, Ready, Section, Stat, StatRow, Table, useBatteryChoice, type Column } from "../../ui";

// Hedge: the instrument as ElectronX publishes it, the contracts each plan
// holds by hour, and the entry price the comparison assumes. A scenario
// comparison at an assumed entry: no order is placed.

const ARMS: ArmName[] = ["A", "B", "C"];
const signed = (n: number) => (n > 0 ? `+${formatInt(n)}` : formatInt(n));

interface Row {
  hour: number;
  entry: number | null;
  contracts: Partial<Record<ArmName, number>>;
}

function rows(desk: Desk, entry: number[] | undefined): Row[] {
  return HOURS_OF_DAY.map((h) => ({
    hour: h,
    entry: entry?.[h] ?? null,
    contracts: Object.fromEntries(ARMS.flatMap((a) => (desk.arms[a] ? [[a, desk.arms[a]!.contracts[h]!]] : []))),
  }));
}

export default function HedgePage() {
  const choice = useBatteryChoice();
  const all = combine(useDesk(choice.resource), useDeskCommon());

  return (
    <div className="page page--hedge">
      <PageHeader
        title="Hedge"
        lede="Plans B and C may sell or buy ElectronX's hourly bounded futures at the battery's hub. The comparison takes each contract at an assumed fair-value entry; no order is placed."
      />
      <BatteryBar choice={choice} />
      <Ready state={all}>
        {([desk, common]) => {
          const ins = common.instrument;
          const arms = ARMS.filter((x) => desk.arms[x]);
          const cols: Column<Row>[] = [
            { key: "hour", label: "Hour (CT)", kind: "number", align: "left", value: (r) => r.hour, render: (r) => `${hourStartLabel(r.hour)} · ${hourEndingLabel(r.hour)}` },
            { key: "entry", label: "Assumed entry, $/MWh", kind: "number", value: (r) => r.entry, render: (r) => dollarsPerMwh(r.entry) },
            ...arms.map(
              (x): Column<Row> => ({
                key: x,
                label: `Plan ${x}`,
                title: `${armMeta[x].label}: contracts, sold positive`,
                kind: "number",
                value: (r) => r.contracts[x] ?? null,
                render: (r) => (r.contracts[x] == null ? "no value" : signed(r.contracts[x]!)),
              }),
            ),
          ];
          return (
            <>
              <Section
                title="Published terms"
                source={
                  <>
                    Terms as ElectronX publishes them:{" "}
                    {ins.source_urls.map((u) => (
                      <a key={u} href={u} target="_blank" rel="noreferrer">
                        {u.replace(/^https:\/\//, "")}
                        <Glyph name="popout" />
                      </a>
                    ))}
                  </>
                }
              >
                <StatRow>
                  <Stat label="Instrument" value={`${ins.venue} ${ins.product}`} size="sm" note={`at ${desk.hub}, ${formatInt(ins.size_kwh / 1000)} MWh a contract`} />
                  <Stat label="Range" value={`$${dollarsPerMwh(ins.range_cents[0])} to $${dollarsPerMwh(ins.range_cents[1])}`} size="sm" note={`tick $${dollarsPerMwh(ins.tick_cents)}/MWh`} />
                  <Stat label="Fee" value={`$${(ins.fee_cents_per_contract / 100).toFixed(2)}`} size="sm" note="a contract" />
                  <Stat label="Settles at" value="The hour's real-time hub price" size="sm" note={ins.settlement} />
                </StatRow>
              </Section>
              <Section title="Collateral by plan" source={`${ins.collateral.replace(/^./, (c) => c.toUpperCase())}.`}>
                <StatRow>
                  {arms.map((x) => (
                    <Stat key={x} label={`Plan ${x}: ${armMeta[x].label.toLowerCase()}`} value={formatUsd(desk.arms[x]!.collateralUsd)} size="sm" />
                  ))}
                </StatRow>
              </Section>
              <Section
                title="Contracts by hour"
                lede="Contracts held each hour, sold positive and bought negative, beside the entry the comparison assumes."
                source={`${SOURCE_LINE} Operating day ${formatOperatingDay(common.operatingDay)}, hours in CT. Entry ${ins.entry_rule}.`}
              >
                <Table columns={cols} rows={rows(desk, common.entryCents[desk.hub])} rowKey={(r) => String(r.hour)} dense />
              </Section>
            </>
          );
        }}
      </Ready>
    </div>
  );
}
