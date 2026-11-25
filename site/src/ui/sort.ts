// Three-state column sort: the column's own way first (numbers highest
// first, words A to Z), then the other way, then the table's own order.
// Missing values sort last either way; ties keep the table's order.

export type SortValue = number | string | null | undefined;
export type SortKind = "number" | "text";
export interface SortState {
  key: string;
  desc: boolean;
}

export function firstWayDesc(kind: SortKind): boolean {
  return kind === "number";
}

export function nextSort(current: SortState | null, key: string, kind: SortKind): SortState | null {
  const first = firstWayDesc(kind);
  if (!current || current.key !== key) return { key, desc: first };
  if (current.desc === first) return { key, desc: !first };
  return null;
}

function missing(v: SortValue): boolean {
  return v == null || v === "" || (typeof v === "number" && Number.isNaN(v));
}

export function compareValues(a: SortValue, b: SortValue): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "en-US", { numeric: true });
}

export function sortRows<T>(rows: readonly T[], value: (row: T) => SortValue, desc: boolean): T[] {
  return rows
    .map((row, i) => ({ row, i, v: value(row) }))
    .sort((x, y) => {
      const mx = missing(x.v);
      const my = missing(y.v);
      if (mx || my) return mx === my ? x.i - y.i : mx ? 1 : -1;
      const c = compareValues(x.v, y.v);
      return c === 0 ? x.i - y.i : desc ? -c : c;
    })
    .map((e) => e.row);
}
