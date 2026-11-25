import type { ChainReceipt } from "../data/types";
import { dualTime } from "../lib/time";
import { formatInt } from "../lib/format";
import { Hash } from "./Hash";
import { ParcFerme } from "./ParcFerme";

interface ReceiptProps {
  receipt: ChainReceipt;
  /** Compact drops the key, scope and code hash rows. */
  compact?: boolean;
  className?: string;
}

function lead(seconds: number): string {
  const m = Math.floor(Math.abs(seconds) / 60);
  const s = Math.abs(seconds) % 60;
  return `${m} min ${String(s).padStart(2, "0")} s ${seconds >= 0 ? "before" : "after"} the gate`;
}

export function Receipt({ receipt: r, compact = false, className }: ReceiptProps) {
  const t = dualTime(r.blockTime);
  return (
    <article className={`receipt${className ? ` ${className}` : ""}`} aria-label={`${r.chainName} receipt`}>
      <header className="receipt__head">
        <div>
          <div className="eyebrow">{r.mainnet ? "Mainnet" : "Testnet"} · chain {r.chainId}</div>
          <h3 className="receipt__chain">{r.chainName}</h3>
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
            <span className="muted">{t.bangkok}</span>
          </dd>
        </div>
        <div>
          <dt>Lead</dt>
          <dd className="num">{lead(r.secondsBeforeGate)}</dd>
        </div>
        <div>
          <dt>Root</dt>
          <dd>
            <Hash value={r.root} label="root" />
          </dd>
        </div>
        <div>
          <dt>Leaves</dt>
          <dd className="num">{formatInt(r.leafCount)}</dd>
        </div>
        <div>
          <dt>Contract</dt>
          <dd>
            <Hash value={r.contract} href={r.contractUrl} label="contract address" />
          </dd>
        </div>
        {!compact && (
          <>
            <div>
              <dt>Key</dt>
              <dd>
                <Hash value={r.key} label="record key" />
              </dd>
            </div>
            <div>
              <dt>Scope</dt>
              <dd>
                <span className="mono receipt__scope">{r.scopeLabel}</span>
              </dd>
            </div>
            <div>
              <dt>Code hash</dt>
              <dd>
                <Hash value={r.codeHash} head={10} tail={4} label="code hash" />
              </dd>
            </div>
          </>
        )}
      </dl>
    </article>
  );
}
