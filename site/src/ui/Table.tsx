import { useMemo, useState, type ReactNode } from "react";
import { Glyph } from "./Glyph";
import { nextSort, sortRows, type SortKind, type SortState, type SortValue } from "./sort";

export interface Column<T> {
  key: string;
  label: ReactNode;
  /** Numbers sort highest first on the first click, words A to Z. */
  kind?: SortKind;
  value: (row: T) => SortValue;
  render?: (row: T, position: number) => ReactNode;
  align?: "left" | "right" | "center";
  /** CSS width, e.g. "8ch" or "12%". */
  width?: string;
  sortable?: boolean;
  /** Screen-reader text when the label is short or a glyph. */
  title?: string;
}

interface TableProps<T> {
  columns: Column<T>[];
  rows: readonly T[];
  rowKey: (row: T) => string;
  caption?: ReactNode;
  initialSort?: SortState | null;
  /** A leading position column (P1, P2 ...) that follows the current order. */
  positions?: boolean;
  onRowClick?: (row: T) => void;
  /** Highlight one row, e.g. the showcase battery. */
  isHighlighted?: (row: T) => boolean;
  /** Scrolls inside the table with a sticky header past this height. */
  maxHeight?: number | string;
  dense?: boolean;
  empty?: ReactNode;
  className?: string;
}

export function Table<T>({
  columns,
  rows,
  rowKey,
  caption,
  initialSort = null,
  positions = false,
  onRowClick,
  isHighlighted,
  maxHeight,
  dense = false,
  empty = "Nothing to show.",
  className,
}: TableProps<T>) {
  const [sort, setSort] = useState<SortState | null>(initialSort);
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    return col ? sortRows(rows, col.value, sort.desc) : rows;
  }, [rows, columns, sort]);

  return (
    <div
      className={`gp-table${dense ? " gp-table--dense" : ""}${className ? ` ${className}` : ""}`}
      style={maxHeight !== undefined ? { maxHeight } : undefined}
    >
      <table>
        {caption && <caption>{caption}</caption>}
        <thead>
          <tr>
            {positions && (
              <th scope="col" className="gp-table__pos" style={{ width: "4.5ch" }}>
                <span className="visually-hidden">Position</span>
                <span aria-hidden="true">P</span>
              </th>
            )}
            {columns.map((c) => {
              const active = sort?.key === c.key;
              const canSort = c.sortable !== false;
              const kind = c.kind ?? "text";
              return (
                <th
                  key={c.key}
                  scope="col"
                  style={c.width ? { width: c.width } : undefined}
                  className={`align-${c.align ?? (kind === "number" ? "right" : "left")}${active ? " is-sorted" : ""}`}
                  aria-sort={active ? (sort.desc ? "descending" : "ascending") : undefined}
                >
                  {canSort ? (
                    <button type="button" className="gp-table__sort" onClick={() => setSort(nextSort(sort, c.key, kind))} title={c.title}>
                      <span>{c.label}</span>
                      <Glyph name={active ? (sort.desc ? "sort-down" : "sort-up") : "dash"} size={11} className="gp-table__sort-glyph" />
                    </button>
                  ) : (
                    <span title={c.title}>{c.label}</span>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 && (
            <tr>
              <td colSpan={columns.length + (positions ? 1 : 0)} className="gp-table__empty">
                {empty}
              </td>
            </tr>
          )}
          {sorted.map((row, i) => (
            <tr
              key={rowKey(row)}
              className={`${onRowClick ? "is-clickable" : ""}${isHighlighted?.(row) ? " is-highlighted" : ""}`}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              onKeyDown={
                onRowClick
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onRowClick(row);
                      }
                    }
                  : undefined
              }
              tabIndex={onRowClick ? 0 : undefined}
            >
              {positions && <td className="gp-table__pos num">{i + 1}</td>}
              {columns.map((c) => (
                <td key={c.key} className={`align-${c.align ?? ((c.kind ?? "text") === "number" ? "right" : "left")}`}>
                  {c.render ? c.render(row, i) : formatCell(c.value(row))}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatCell(v: SortValue): ReactNode {
  if (v == null || v === "") return <span className="muted">—</span>;
  return String(v);
}
