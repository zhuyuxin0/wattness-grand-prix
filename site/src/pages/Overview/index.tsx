import { Link } from "react-router-dom";
import { SOURCE_LINE } from "../../config";
import { combine, useDay, useLateSeal, useReceipts } from "../../data";
import { minSec } from "../../lib/clock";
import { formatInt } from "../../lib/format";
import { dualTime, formatCountdown, formatOperatingDay, nextGate } from "../../lib/time";
import { batteryPath, useSelectedBattery } from "../../shell/battery";
import { useSecondClock } from "../../shell/MarketClock";
import { panelSections, type PanelGroup } from "../../shell/tabs";
import { Glyph, Ready, Section, Stat, StatRow } from "../../ui";
import { ControlRoom } from "./ControlRoom";
import { Timeline } from "./Timeline";
import "./styles.css";

// Overview: the Terminal's home, then where the day stands. It opens on the
// control room (ControlRoom.tsx): the Tech Stack's 3D in motion behind glass
// panes that open the tabs. Under it ERCOT's next gate leads; then the latest
// sealed record at a glance, the day in order with a line at now, and a path
// into every tab.

const CHAIN_SOURCE = "Commits: GateRecord on BNB Smart Chain, read from each chain's receipt.";

/** Every group's tabs but this one, in the panel's order. */
const PATHS = panelSections()
  .map((s) => ({ group: s.group, tabs: s.tabs.filter((t) => t.id !== "overview") }))
  .filter((s): s is { group: PanelGroup; tabs: typeof s.tabs } => s.group !== null && s.tabs.length > 0);

export default function OverviewPage() {
  const all = combine(useDay(), useReceipts(), useLateSeal());
  const [battery] = useSelectedBattery();
  // The masthead's clock, ticking on the second, so the countdown and the market clock turn together.
  const nowMs = useSecondClock();

  return (
    <div className="page page--overview">
      <ControlRoom />

      <NextGate nowMs={nowMs} />

      <Ready state={all}>
        {([day, r, late]) => {
          const main = r.receipts.find((x) => x.mainnet) ?? r.receipts[0];
          const sealedAt = main ? dualTime(main.blockTime) : null;
          return (
            <>
              <Section
                title="Latest Sealed Record"
                actions={
                  <Link to="/seal" className="ov-more">
                    Open Seal
                    <Glyph name="next" />
                  </Link>
                }
                source={`${SOURCE_LINE} ${CHAIN_SOURCE}`}
              >
                <StatRow className="ov-stats">
                  <Stat label="Operating day" value={formatOperatingDay(day.operatingDay)} size="sm" note={`${day.market}, under ${day.regime}`} />
                  <Stat label="Plans sealed" value={formatInt(day.leafCount)} note="One leaf per battery, under one root" />
                  {main && sealedAt && (
                    <Stat
                      label="Sealed before the gate"
                      value={minSec(main.secondsBeforeGate)}
                      tone="sealed"
                      note={`${sealedAt.ct}${sealedAt.yours ? ` · ${sealedAt.yours}` : ""}`}
                    />
                  )}
                  <Stat
                    label="On chain"
                    value={r.receipts.length === 2 ? "Mainnet and testnet" : formatInt(r.receipts.length)}
                    size="sm"
                    note={r.receipts.map((x) => `${x.chainName} (chain ${x.chainId})`).join(" and ")}
                  />
                  <Stat label="Late commit" value="Refused" tone="refused" size="sm" note={`Simulated ${late.secondsAfterGate} s after the gate, on both chains`} />
                </StatRow>
              </Section>

              <Section
                title="What Happens Next"
                lede="The record's own times in order, in market time (CT) with yours beside them. What lies below the line has not happened yet."
                source={`${SOURCE_LINE} ${CHAIN_SOURCE}`}
              >
                <Timeline day={day} receipts={r} late={late} nowMs={nowMs} />
              </Section>
            </>
          );
        }}
      </Ready>

      <Section title="Where to Look" lede="Every tab, in the order a plan moves: made, sealed, checked.">
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

/** The lead: ERCOT's next day-ahead gate, counted down in market time with the reader's own beside it. */
function NextGate({ nowMs }: { nowMs: number }) {
  const gate = nextGate(nowMs);
  const left = Math.max(0, gate.unix - Math.floor(nowMs / 1000));
  const at = dualTime(gate.unix, { seconds: false });
  const closing = left <= 600;
  return (
    <section className="ov-gate" aria-labelledby="ov-gate-title">
      <h2 id="ov-gate-title" className="ov-gate__label">
        Next gate
      </h2>
      <p className={`ov-gate__digits num${closing ? " ov-gate__digits--closing" : ""}`} role="timer" aria-live="off" aria-label={`${formatCountdown(left)} to the gate`}>
        {formatCountdown(left)}
      </p>
      <p className="ov-gate__meta">
        <span className="ov-gate__at">
          <b className="num">{at.ct}</b>
          {at.yours && <span className="muted num"> · {at.yours}</span>}
        </span>
        <span className="ov-gate__what">ERCOT's day-ahead market closes for bids on {formatOperatingDay(gate.operatingDay)}.</span>
      </p>
    </section>
  );
}
