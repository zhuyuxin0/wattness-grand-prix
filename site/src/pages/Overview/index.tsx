import { Link } from "react-router-dom";
import { SOURCE_LINE } from "../../config";
import { combine, useDay, useLateSeal, useReceipts } from "../../data";
import { captureClock } from "../../lib/capture";
import { minSec } from "../../lib/clock";
import { formatInt } from "../../lib/format";
import { dualTime, formatOperatingDay } from "../../lib/time";
import { batteryPath, useSelectedBattery } from "../../shell/battery";
import { panelSections, type PanelGroup } from "../../shell/tabs";
import { Countdown, Glyph, PageHeader, ParcFerme, Ready, Section, Stat, StatRow } from "../../ui";
import { WeekendStrip } from "./WeekendStrip";
import "./styles.css";

// Overview: today at a glance. The next gate, the latest sealed record, what
// happens next, and a path into every tab.

/** Every group's tabs but this one, in the panel's order. */
const PATHS = panelSections()
  .map((s) => ({ group: s.group, tabs: s.tabs.filter((t) => t.id !== "overview") }))
  .filter((s): s is { group: PanelGroup; tabs: typeof s.tabs } => s.group !== null && s.tabs.length > 0);
export default function OverviewPage() {
  const all = combine(useDay(), useReceipts(), useLateSeal());
  const [battery] = useSelectedBattery();

  return (
    <div className="page page--overview">
      <PageHeader
        title="Overview"
        lede="Agents plan tomorrow for every ERCOT battery and seal each plan on BNB Chain before the 10:00 CT day-ahead gate. Anyone can check any plan against the chain."
        aside={<Countdown now={captureClock()} size="md" label="Next gate" />}
      />

      <Ready state={all}>
        {([day, r, late]) => {
          const main = r.receipts.find((x) => x.mainnet) ?? r.receipts[0];
          const sealedAt = main ? dualTime(main.blockTime) : null;
          return (
            <>
              <Section
                title="Latest sealed record"
                actions={<ParcFerme state="sealed" />}
                source={`${SOURCE_LINE} Commits: GateRecord on BNB Smart Chain, read from each chain's receipt.`}
              >
                <StatRow>
                  <Stat label="Operating day" value={formatOperatingDay(day.operatingDay)} size="sm" note={`${day.market}, ${day.regime}`} />
                  <Stat label="Plans sealed" value={formatInt(day.leafCount)} note="one leaf per battery, one root" />
                  {main && sealedAt && (
                    <Stat
                      label="Sealed before the gate"
                      value={minSec(main.secondsBeforeGate)}
                      tone="sealed"
                      note={`${sealedAt.ct}${sealedAt.yours ? ` · ${sealedAt.yours}` : ""}`}
                    />
                  )}
                  <Stat
                    label="Chains"
                    value={formatInt(r.receipts.length)}
                    note={r.receipts.map((x) => `${x.chainName} (chain ${x.chainId})`).join(" and ")}
                  />
                  <Stat label="Late seal" value="Refused" tone="refused" size="sm" note={`${late.secondsAfterGate} s after the gate, on both chains`} />
                </StatRow>
              </Section>

              <Section
                title="What happens next"
                lede="The record's own times: the plan's timestamp, each commit's block, the gate the contract computes."
                source="Times in market time (CT) with yours beside them. Calculation and display: Wattness."
              >
                <WeekendStrip day={day} receipts={r} late={late} />
              </Section>
            </>
          );
        }}
      </Ready>

      <Section title="Where to look">
        <div className="ov-paths">
          {PATHS.map((s) => (
            <div key={s.group.id} className="ov-paths__group">
              <h3 className="ov-paths__head">{s.group.label}</h3>
              <ul>
                {s.tabs.map((t) => (
                  <li key={t.id}>
                    <Link to={t.battery ? batteryPath(t.path, battery) : t.path} className="ov-paths__link">
                      {t.label}
                      <Glyph name="next" />
                    </Link>
                    <p>{t.summary}</p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
