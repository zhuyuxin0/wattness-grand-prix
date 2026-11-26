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
