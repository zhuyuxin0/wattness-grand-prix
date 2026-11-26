import type { ReactNode } from "react";
import { Glyph } from "../../ui";
import { LiveRead, type LiveChain } from "../../ui/LiveRead";
import { failureDetail, type NodeRead, type ReadBlock } from "./chain";
import type { Polled } from "./useAtlas";

// A live read of BNB Smart Chain in the site's states: the shared loading bar
// before it, one muted line with Read again if no first read lands, then the
// shared stamp, whose failed line keeps the last good read on screen.

export const BNB_SMART_CHAIN: LiveChain = { id: 56, name: "BNB Smart Chain" };

/** "Failed to fetch, from all 5 public nodes." */
function sentence(error: Error): string {
  const d = failureDetail(error);
  return `${d.charAt(0).toUpperCase()}${d.slice(1)}.`;
}

/** The read's block, its time in CT and the reader's own, the node, and Read again. */
export function Stamp<T>({ polled, block }: { polled: Polled<NodeRead<T>>; block: ReadBlock }) {
  if (!polled.data) return null;
  return (
    <LiveRead
      chain={BNB_SMART_CHAIN}
      at={{ number: block.number, time: block.timestamp }}
      rpc={polled.data.rpc}
      busy={polled.busy}
      error={polled.error ? new Error(sentence(polled.error)) : null}
      onRefresh={polled.again}
    />
  );
}

/** No first read yet and the last attempt failed: what is not shown, and a way to read again. */
export function Unread<T>({ polled, children }: { polled: Polled<T>; children: ReactNode }) {
  return (
    <p className="atlas-unread">
      {children}
      <button type="button" className="live-read__again" onClick={polled.again} disabled={polled.busy}>
        <Glyph name="refresh" />
        {polled.busy ? "Reading" : "Read again"}
      </button>
    </p>
  );
}
