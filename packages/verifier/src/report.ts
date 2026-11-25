export type Status = "PASS" | "FAIL" | "SKIP";

export interface CheckResult {
  id: string;
  title: string;
  status: Status;
  /** One line each; the first says why the status is what it is. */
  details: string[];
}

export const pass = (id: string, title: string, details: string[] = []): CheckResult => ({ id, title, status: "PASS", details });
export const fail = (id: string, title: string, details: string[]): CheckResult => ({ id, title, status: "FAIL", details });
export const skip = (id: string, title: string, details: string[]): CheckResult => ({ id, title, status: "SKIP", details });

/** FAIL if any problem, else PASS. */
export function judge(id: string, title: string, problems: string[], notes: string[] = []): CheckResult {
  return problems.length > 0 ? fail(id, title, [...problems, ...notes]) : pass(id, title, notes);
}

export function formatReport(results: readonly CheckResult[]): string {
  const lines: string[] = [];
  for (const r of results) {
    lines.push(`${r.status.padEnd(4)}  ${r.id.padEnd(3)} ${r.title}`);
    for (const d of r.details) lines.push(`            ${d}`);
  }
  const failed = results.filter((r) => r.status === "FAIL").length;
  const skipped = results.filter((r) => r.status === "SKIP").length;
  lines.push("");
  lines.push(
    failed > 0
      ? `REJECTED: ${failed} check${failed === 1 ? "" : "s"} failed`
      : `VERIFIED${skipped > 0 ? ` (${skipped} skipped)` : ""}`,
  );
  return lines.join("\n");
}
