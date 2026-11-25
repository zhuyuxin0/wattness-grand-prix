import type { ReactNode } from "react";
import type { ChainReceipt } from "../../data";
import { minSec } from "../../lib/clock";
import { formatInt } from "../../lib/format";
import { dualTime } from "../../lib/time";
import { Glyph, Hash } from "../../ui";

// Both receipts field by field: what each chain recorded, and whether the two
// agree. A receipt is the chain's own account, so this is the witness.

interface Field {
  name: string;
  /** The field's value in one receipt. */
  cell: (r: ChainReceipt) => ReactNode;
  /** What makes two receipts agree on this field; none for a field that differs by chain. */
  key?: (r: ChainReceipt) => string | number;
}

const FIELDS: Field[] = [
  { name: "Transaction", cell: (r) => <Hash value={r.txHash} href={r.txUrl} label={`${r.chainName} transaction hash`} /> },
  { name: "Block", cell: (r) => <span className="num">{formatInt(r.blockNumber)}</span> },
  {
    name: "Block time",
    cell: (r) => {
      const t = dualTime(r.blockTime);
      return (
        <span className="rt-time num">
          <span>{t.ct}</span>
          {t.yours && <span className="muted">{t.yours}</span>}
        </span>
      );
    },
  },
  { name: "Before the gate", cell: (r) => <span className="num">{minSec(r.secondsBeforeGate)}</span> },
  { name: "Root", cell: (r) => <Hash value={r.root} label="root" />, key: (r) => r.root.toLowerCase() },
  { name: "Leaves", cell: (r) => <span className="num">{formatInt(r.leafCount)}</span>, key: (r) => r.leafCount },
  { name: "Scope", cell: (r) => <code className="rt-code">{r.scopeLabel}</code>, key: (r) => r.scope.toLowerCase() },
  { name: "Code hash", cell: (r) => <Hash value={r.codeHash} head={10} tail={4} label="code hash" />, key: (r) => r.codeHash.toLowerCase() },
  { name: "Record key", cell: (r) => <Hash value={r.key} label="record key" />, key: (r) => r.key.toLowerCase() },
  { name: "Contract", cell: (r) => <Hash value={r.contract} href={r.contractUrl} label="contract address" />, key: (r) => r.contract.toLowerCase() },
];

const short = (r: ChainReceipt) => (r.mainnet ? "Mainnet" : "Testnet");

export function RecordTable({ receipts }: { receipts: ChainReceipt[] }) {
  return (
    <div className="rt" role="table" aria-label="Both receipts, field by field">
      <div className="rt__row rt__row--head" role="row">
        <span role="columnheader">Field</span>
        {receipts.map((r) => (
          <span key={r.chainId} role="columnheader">
            {r.chainName} <span className="rt__code">(chain {r.chainId})</span>
          </span>
        ))}
        <span role="columnheader">Both chains</span>
      </div>
      {FIELDS.map((f) => {
        const keys = f.key ? receipts.map(f.key) : null;
        const same = keys ? keys.every((k) => k === keys[0]) : null;
        return (
          <div key={f.name} className="rt__row" role="row">
            <span role="rowheader" className="rt__field">
              {f.name}
            </span>
            {receipts.map((r) => (
              <span key={r.chainId} role="cell" className="rt__cell" data-chain={short(r)}>
                {f.cell(r)}
              </span>
            ))}
            <span role="cell" className={`rt__same${same === false ? " rt__same--bad" : ""}`}>
              {same === null ? null : same ? (
                <>
                  <Glyph name="check" />
                  Same
                </>
              ) : (
                <>
                  <Glyph name="close" />
                  Differs
                </>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}
