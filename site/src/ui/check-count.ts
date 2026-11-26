// The words of a "Check it" line (CheckIt.tsx), apart from the component so the tests can read them in Node.

export type CheckKind = "file" | "record" | "transaction" | "address" | "root" | "key" | "hash" | "signature";

/** Each kind's word, one and many. */
export const CHECK_WORDS: Record<CheckKind, readonly [string, string]> = {
  file: ["file", "files"],
  record: ["record", "records"],
  transaction: ["transaction", "transactions"],
  address: ["address", "addresses"],
  root: ["root", "roots"],
  key: ["key", "keys"],
  hash: ["hash", "hashes"],
  signature: ["signature", "signatures"],
};

/** The order the closed line counts them in. */
export const CHECK_ORDER: readonly CheckKind[] = ["file", "record", "transaction", "address", "root", "key", "hash", "signature"];

/** The closed line's count, in that order: "3 files · 2 transactions". */
export function countLine(items: readonly { kind: CheckKind }[]): string {
  const n = new Map<CheckKind, number>();
  for (const it of items) n.set(it.kind, (n.get(it.kind) ?? 0) + 1);
  return CHECK_ORDER.filter((k) => n.has(k))
    .map((k) => {
      const c = n.get(k)!;
      return `${c.toLocaleString("en-US")} ${CHECK_WORDS[k][c === 1 ? 0 : 1]}`;
    })
    .join(" · ");
}
