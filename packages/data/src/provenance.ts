/** One input file: the route it answers, its bytes' SHA-256, and a public URL serving those bytes. */
export interface Provenance {
  route: string;
  sha256: string;
  url: string;
}

/** Collects every file read, once each, in first-read order. */
export class ProvenanceLog {
  private readonly seen = new Map<string, Provenance>();

  add(entry: Provenance): void {
    const key = `${entry.route}\u0000${entry.sha256}`;
    if (!this.seen.has(key)) this.seen.set(key, Object.freeze({ ...entry }));
  }

  entries(): Provenance[] {
    return [...this.seen.values()];
  }
}
