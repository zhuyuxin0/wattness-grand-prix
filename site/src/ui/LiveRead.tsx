import { explorerUrl } from "../lib/chain";
import { formatInt } from "../lib/format";
import type { ReadAt } from "../lib/testnet";
import { dualTime } from "../lib/time";
import { Glyph } from "./Glyph";
import "./live-read.css";

// Only a type comes from lib/testnet: its runtime holds viem's client, which a
// page that stamps a read made another way should not have to load.

/** The chain a stamp names: its id, for the explorer's block link, and its name in the stamp. */
export interface LiveChain {
  id: number;
  name: string;
}

const BSC_TESTNET: LiveChain = { id: 97, name: "BSC testnet" };

const hostOf = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

interface LiveReadProps {
  at: ReadAt;
  rpc: string;
  /** BSC testnet unless given. */
  chain?: LiveChain;
  busy?: boolean;
  /** The last refresh failed; the figures shown are from `at`. */
  error?: Error | null;
  onRefresh?: () => void;
  className?: string;
}

/** Where and when a live chain read was taken: the block, its time in CT and the reader's own, the node. */
export function LiveRead({ at, rpc, chain = BSC_TESTNET, busy = false, error, onRefresh, className }: LiveReadProps) {
  const t = dualTime(at.time);
  const block = formatInt(Number(at.number));
  const href = explorerUrl(chain.id, "block", String(at.number));
  return (
    <div className={`live-read${className ? ` ${className}` : ""}`}>
      <p className="live-read__text">
        <span className="live-read__mark" aria-hidden="true" />
        <span>
          Read live from {chain.name} at block{" "}
          {href ? (
            <a className="num" href={href} target="_blank" rel="noreferrer">
              {block}
            </a>
          ) : (
            <span className="num">{block}</span>
          )}
          , <span className="num">{t.ct}</span>
          {t.yours && <span className="muted num"> · {t.yours}</span>}
          <span className="muted">, through {hostOf(rpc)}</span>
        </span>
      </p>
      {onRefresh && (
        <button type="button" className="live-read__again" onClick={onRefresh} disabled={busy}>
          <Glyph name="refresh" />
          {busy ? "Reading" : "Read again"}
        </button>
      )}
      {error && (
        <p className="live-read__failed" role="status">
          The last read failed, so these figures are from the block above. {error.message}
        </p>
      )}
    </div>
  );
}
