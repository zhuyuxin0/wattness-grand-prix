import type { ReactNode } from "react";
import { CheckIt as Shared } from "../../ui";

/** A section's hashes and addresses, folded: the site's one Check it (ui/CheckIt), its closed line saying what it holds. */
export function CheckIt({ what, children }: { what: string; children: ReactNode }) {
  return <Shared summary={what.charAt(0).toUpperCase() + what.slice(1)}>{children}</Shared>;
}
