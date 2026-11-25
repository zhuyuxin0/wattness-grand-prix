// Field-level differences between two JSON documents, for naming what a
// tampered copy changed.

export interface Change {
  path: string;
  before: unknown;
  after: unknown;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const MISSING = Symbol("missing");

export function diffJson(before: unknown, after: unknown, path = "$", out: Change[] = []): Change[] {
  if (Array.isArray(before) && Array.isArray(after)) {
    const n = Math.max(before.length, after.length);
    for (let i = 0; i < n; i++) {
      diffJson(i < before.length ? before[i] : MISSING, i < after.length ? after[i] : MISSING, `${path}[${i}]`, out);
    }
    return out;
  }
  if (isObj(before) && isObj(after)) {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
    for (const k of keys) diffJson(k in before ? before[k] : MISSING, k in after ? after[k] : MISSING, `${path}.${k}`, out);
    return out;
  }
  if (!Object.is(before, after)) out.push({ path, before, after });
  return out;
}

function show(v: unknown): string {
  if (v === MISSING) return "(absent)";
  const s = JSON.stringify(v);
  return s.length > 60 ? `${s.slice(0, 57)}...` : s;
}

export function formatChanges(changes: readonly Change[], limit = 12): string[] {
  const lines = changes.slice(0, limit).map((c) => `${c.path}: ${show(c.before)} -> ${show(c.after)}`);
  if (changes.length > limit) lines.push(`... and ${changes.length - limit} more`);
  return lines;
}
