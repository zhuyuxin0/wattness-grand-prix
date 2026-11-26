import type { ReactNode } from "react";
import type { ChainReceipt } from "../../data";
import { minSec } from "../../lib/clock";
import { formatInt } from "../../lib/format";
import { dualTime } from "../../lib/time";
import { Glyph, type CheckItem } from "../../ui";

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
  { name: "Leaves", cell: (r) => <span className="num">{formatInt(r.leafCount)}</span>, key: (r) => r.leafCount },
  { name: "Scope", cell: (r) => <code className="rt-code">{r.scopeLabel}</code>, key: (r) => r.scope.toLowerCase() },
];

/** The fields whose values are hashes and addresses: compared here, their values in the section's Check it. */
const HASHED: { name: string; key: (r: ChainReceipt) => string }[] = [
  { name: "Root", key: (r) => r.root.toLowerCase() },
  { name: "Code hash", key: (r) => r.codeHash.toLowerCase() },
  { name: "Record key", key: (r) => r.key.toLowerCase() },
  { name: "Contract", key: (r) => r.contract.toLowerCase() },
];

/** The section's Check it: each chain's commit and contract, and the root, code hash and key once if both agree. */
export function recordItems(receipts: ChainReceipt[]): CheckItem[] {
  const items: CheckItem[] = [];
  const both = (k: (r: ChainReceipt) => string) => receipts.every((r) => k(r) === k(receipts[0]!));
  for (const r of receipts) items.push({ kind: "transaction", label: `The commit on ${r.chainName}`, value: r.txHash, href: r.txUrl, copy: `${r.chainName} transaction hash`, note: `Block ${formatInt(r.blockNumber)}` });
  const first = receipts[0];
  if (!first) return items;
  const one = (kind: CheckItem["kind"], label: string, k: (r: ChainReceipt) => string, value: (r: ChainReceipt) => string, href?: (r: ChainReceipt) => string | null) => {
    if (both(k)) items.push({ kind, label: `${label}, the same on both chains`, value: value(first), href: href?.(first) ?? null, copy: label.toLowerCase() });
    else for (const r of receipts) items.push({ kind, label: `${label} on ${r.chainName}`, value: value(r), href: href?.(r) ?? null, copy: `${label.toLowerCase()} on ${r.chainName}` });
  };
  one("root", "The root", (r) => r.root.toLowerCase(), (r) => r.root);
  one("hash", "The code hash", (r) => r.codeHash.toLowerCase(), (r) => r.codeHash);
  one("key", "The record key", (r) => r.key.toLowerCase(), (r) => r.key);
  if (both((r) => r.contract.toLowerCase())) {
    for (const r of receipts) items.push({ kind: "address", label: `GateRecord on ${r.chainName}`, value: r.contract, href: r.contractUrl, copy: `GateRecord address on ${r.chainName}` });
  } else one("address", "GateRecord", (r) => r.contract.toLowerCase(), (r) => r.contract, (r) => r.contractUrl);
  return items;
}

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
      {HASHED.map((f) => {
        const same = receipts.every((r) => f.key(r) === f.key(receipts[0]!));
        return (
          <div key={f.name} className="rt__row rt__row--hashed" role="row">
            <span role="rowheader" className="rt__field">
              {f.name}
            </span>
            <span role="cell" className="rt__cell rt__cell--span">
              {same ? "One value on both chains" : "A different value on each chain"}
              <span className="muted"> · in Check it</span>
            </span>
            <span role="cell" className={`rt__same${same ? "" : " rt__same--bad"}`}>
              <Glyph name={same ? "check" : "close"} />
              {same ? "Same" : "Differs"}
            </span>
          </div>
        );
      })}
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
