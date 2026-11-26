/**
 * A request that ends without the file: the status and a plain reason. 404 for what the record does not
 * hold, 502 for an upstream answer that fails a check, 503 when an upstream cannot be read at all.
 */
export class EdgeError extends Error {
  override name = "EdgeError";
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * At most max characters of s, then its length: how much of a value, or of a whole reason, an answer quotes.
 * A refusal prints at most 200 characters of a value and 2,000 of its reason, so it never carries the file.
 */
export const cut = (s: string, max: number): string => (s.length > max ? `${s.slice(0, max)}... (${s.length} characters)` : s);
