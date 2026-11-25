import type { ReactNode } from "react";
import type { Loaded } from "../data/hooks";

export function Loading({ label = "Loading" }: { label?: string }) {
  return (
    <div className="state state--loading" role="status">
      <span className="state__bar" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function ErrorNote({ error }: { error: Error }) {
  return (
    <div className="state state--error" role="alert">
      {error.message}
    </div>
  );
}

/** Renders children once the data is ready; loading and error states otherwise. */
export function Ready<T>({ state, children, label }: { state: Loaded<T>; children: (data: T) => ReactNode; label?: string }) {
  if (state.status === "loading") return <Loading label={label} />;
  if (state.status === "error") return <ErrorNote error={state.error} />;
  return <>{children(state.data)}</>;
}
