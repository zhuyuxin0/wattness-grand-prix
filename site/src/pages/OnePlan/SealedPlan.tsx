import type { SealReceipt } from "@world/game";
import { minSec } from "../../lib/clock";
import { formatInt, formatLead, formatUusd } from "../../lib/format";
import { dualTime, formatOperatingDay } from "../../lib/time";
import { Glyph, Hash, ParcFerme, Section } from "../../ui";

// The visitor's seal, as onSeal hands it over once the commit is mined and its
// Committed event read back: the receipt in the site's own receipt face, the
// plan's score as sealed, and the document whose hash is the root.

const TESTNET_EXPLORER = "https://testnet.bscscan.com";

/** "44 min 43 s" under an hour, "7 h 42 min" past it. */
function lead(seconds: number): string {
  return Math.abs(seconds) < 3600 ? minSec(seconds) : formatLead(seconds);
}

function download(r: SealReceipt) {
  const doc = r.record.doc;
  const blob = new Blob([r.record.json], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `one-plan-${doc.resource}-${doc.operating_day}-${r.record.leaf.slice(2, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function SealedPlan({ receipt: r }: { receipt: SealReceipt }) {
  const t = dualTime(r.blockTime);
  const doc = r.record.doc;
  const dial = doc.plan.dial_steps ? doc.plan.dial_step / doc.plan.dial_steps : 0;
  return (
    <Section
      id="your-seal"
      className="arcade-seal"
      title="Your Sealed Plan"
      lede={
        <>
          Committed from your wallet to GateRecord on BSC testnet, <span className="num">{lead(r.secondsBeforeGate)}</span> before the gate. Keep the plan's
          document: its hash is the root on chain, so anyone can check the plan against it.
        </>
      }
      source="Read back by your wallet from the transaction's receipt and its Committed event, on BNB Smart Chain Testnet (chain 97)."
    >
      <div className="arcade-seal__grid" aria-live="polite">
        <article className="receipt" aria-label="Your seal's receipt">
          <header className="receipt__head">
            <div>
              <div className="eyebrow">Testnet · chain {r.chainId}</div>
              <h3 className="receipt__chain">BNB Smart Chain Testnet</h3>
            </div>
            <ParcFerme state="sealed" size="sm" />
          </header>
          <dl className="receipt__rows">
            <div>
              <dt>Transaction</dt>
              <dd>
                <Hash value={r.txHash} href={r.txUrl} label="transaction hash" />
              </dd>
            </div>
            <div>
              <dt>Block</dt>
              <dd className="num">{formatInt(r.blockNumber)}</dd>
            </div>
            <div>
              <dt>Block time</dt>
              <dd className="receipt__time num">
                <span>{t.ct}</span>
                {t.yours && <span className="muted">{t.yours}</span>}
              </dd>
            </div>
            <div>
              <dt>Lead</dt>
              <dd className="num">{lead(r.secondsBeforeGate)} before the gate</dd>
            </div>
            <div>
              <dt>Your wallet</dt>
              <dd>
                <Hash value={r.committer} href={`${TESTNET_EXPLORER}/address/${r.committer}`} label="wallet address" />
              </dd>
            </div>
            <div>
              <dt>Root</dt>
              <dd>
                <Hash value={r.record.root} label="root" />
              </dd>
            </div>
            <div>
              <dt>Leaves</dt>
              <dd className="num">{formatInt(r.record.leafCount)}</dd>
            </div>
            <div>
              <dt>Contract</dt>
              <dd>
                <Hash value={r.contract} href={`${TESTNET_EXPLORER}/address/${r.contract}`} label="contract address" />
              </dd>
            </div>
            <div>
              <dt>Key</dt>
              <dd>
                <Hash value={r.key} label="record key" />
              </dd>
            </div>
            <div>
              <dt>Scope</dt>
              <dd>
                <span className="mono receipt__scope">{r.record.scopeLabel}</span>
              </dd>
            </div>
          </dl>
        </article>

        <div className="arcade-seal__plan">
          <dl className="arcade-seal__score">
            <div>
              <dt>Score</dt>
              <dd className="num">{formatUusd(doc.score.objective_uusd)}</dd>
            </div>
            <div>
              <dt>Mean day</dt>
              <dd className="num">{formatUusd(doc.score.expected_uusd)}</dd>
            </div>
            <div>
              <dt>Schedule dial</dt>
              <dd className="num">{dial.toFixed(2)} of the way from A to C</dd>
            </div>
            <div>
              <dt>Battery and day</dt>
              <dd>
                <span className="mono">{doc.resource}</span>, {/^\d{4}-\d{2}-\d{2}$/.test(doc.operating_day) ? formatOperatingDay(doc.operating_day) : doc.operating_day}
              </dd>
            </div>
          </dl>
          <div className="arcade-seal__actions">
            <button type="button" className="btn" onClick={() => download(r)}>
              Download the plan's document (JSON)
            </button>
          </div>
          <details className="arcade-seal__doc">
            <summary>
              <Glyph name="caret" className="arcade-seal__caret" />
              The plan's document, as hashed
            </summary>
            <pre className="mono">{r.record.json}</pre>
          </details>
        </div>
      </div>
    </Section>
  );
}
