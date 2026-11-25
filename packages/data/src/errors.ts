export type DataErrorCode = "integrity" | "shape" | "missing" | "network" | "route" | "offline";

export class DataError extends Error {
  override name = "DataError";
  constructor(
    readonly code: DataErrorCode,
    message: string,
  ) {
    super(message);
  }
}
