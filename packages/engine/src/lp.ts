import * as highsModule from "highs";
import type { Highs } from "highs";

// One declaration file serves both builds and types the default as CommonJS; at run time the ESM default is the loader.
const loadHighs = highsModule.default as unknown as () => Promise<Highs>;

export const SOLVER = { name: "HiGHS", package: "highs", version: "1.15.4" } as const;

type Sense = "<=" | ">=" | "=";
type Terms = Iterable<readonly [string, number]>;

/** A linear model written out as CPLEX LP text, which is what the pinned HiGHS reads. */
export class LpModel {
  private readonly objective = new Map<string, number>();
  private readonly rows: { name: string; terms: Map<string, number>; sense: Sense; rhs: number }[] = [];
  private readonly bounds = new Map<string, readonly [number, number]>();
  private readonly binaries: string[] = [];

  constructor(private readonly sense: "max" | "min") {}

  objectiveTerm(v: string, coef: number): void {
    this.objective.set(v, (this.objective.get(v) ?? 0) + coef);
  }

  row(name: string, terms: Terms, sense: Sense, rhs: number): void {
    const acc = new Map<string, number>();
    for (const [v, c] of terms) acc.set(v, (acc.get(v) ?? 0) + c);
    this.rows.push({ name, terms: acc, sense, rhs });
  }

  bound(v: string, lo: number, hi: number): void {
    this.bounds.set(v, [lo, hi]);
  }

  binary(v: string): void {
    this.binaries.push(v);
  }

  toText(): string {
    const out = [this.sense === "max" ? "Maximize" : "Minimize", ` obj:${expr("objective", this.objective)}`, "Subject To"];
    for (const r of this.rows) out.push(` ${r.name}:${expr(r.name, r.terms)} ${r.sense} ${num(r.rhs)}`);
    out.push("Bounds");
    for (const [v, [lo, hi]] of this.bounds) {
      if (lo === -Infinity && hi === Infinity) out.push(` ${v} free`);
      else out.push(` ${lo === -Infinity ? "-inf" : num(lo)} <= ${v} <= ${hi === Infinity ? "+inf" : num(hi)}`);
    }
    if (this.binaries.length > 0) out.push("Binaries", ...this.binaries.map((v) => ` ${v}`));
    out.push("End", "");
    return out.join("\n");
  }
}

function num(x: number): string {
  if (!Number.isFinite(x)) throw new Error(`non-finite coefficient ${x}`);
  return Object.is(x, -0) ? "0" : String(x);
}

// One term per line keeps every line short for the LP reader.
function expr(name: string, terms: Map<string, number>): string {
  let s = "";
  for (const [v, c] of terms) {
    if (c === 0) continue;
    s += `\n   ${c < 0 ? "-" : "+"} ${num(Math.abs(c))} ${v}`;
  }
  if (s === "") throw new Error(`LP ${name} has no terms`);
  return s;
}

export class SolveError extends Error {
  override name = "SolveError";
  constructor(readonly status: string) {
    super(`HiGHS ended with status: ${status}`);
  }
}

export interface Solution {
  objective: number;
  value(v: string): number;
}

let highs: Promise<Highs> | undefined;

export async function solve(model: LpModel, timeLimitSeconds?: number): Promise<Solution> {
  highs ??= loadHighs();
  const result = (await highs).solve(model.toText(), {
    output_flag: false,
    mip_rel_gap: 0,
    ...(timeLimitSeconds === undefined ? {} : { time_limit: timeLimitSeconds }),
  });
  if (result.Status !== "Optimal") throw new SolveError(result.Status);
  const cols = result.Columns as Record<string, { Primal?: number }>;
  return {
    objective: result.ObjectiveValue,
    value(v) {
      const p = cols[v]?.Primal;
      if (p === undefined) throw new Error(`no value for column ${v}`);
      return p;
    },
  };
}
