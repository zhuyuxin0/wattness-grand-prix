import { useEffect, useState } from "react";
import type { Card, Row } from "@world/stations/stack/pieces";
import { loadDay, type Loaded } from "../../data";
import { now } from "../../lib/capture";

// The plain list's pieces, in the stack's own words: each piece's label, its
// card's role and rows (pieces.ts cards, the same text the 3D shows on hover)
// and its tab. Grouped as the 3D groups them, by its zone titles. Loaded by
// dynamic import, like the mount, so the package stays in this tab's chunks.

// The frame data the mount reads (packages/world/src/data, synced before a
// build and not committed). A glob, so the page builds without it: then the
// list names each piece and its tab from the labels alone.
const frameData = import.meta.glob<unknown>("../../../../packages/world/src/data/frame-data.json", { import: "default" });

export interface PieceItem {
  id: string;
  plain: string;
  name?: string;
  role?: string;
  rows: Row[];
  link?: { text: string; href: string };
  /** The package's tab id (ROUTES); the site's path is worldPath(route). */
  route: string;
}

export interface Zone {
  id: string;
  title: string;
  lede: string;
  pieces: PieceItem[];
}

export interface StackList {
  zones: Zone[];
  /** Whether the cards came with the frame data (roles and records), or the labels alone. */
  full: boolean;
  /** When the integrations record's transactions were read back, unix seconds, and over which node. */
  readBack: { unix: number; rpc: string } | null;
}

/** The 3D's zones (its titles, in the panel's case), each with its pieces in the order a plan meets them. */
const ZONES: { id: string; title: string; lede: string; ids: string[] }[] = [
  {
    id: "real",
    title: "Real World",
    lede: "The market the plans are for, its public data, and the odds and hedge terms the agents weigh.",
    ids: ["ercot", "terminal", "cournot", "electronx"],
  },
  {
    id: "agents",
    title: "Agents · BNB Agent Studio",
    lede: "Six agents, each with an on-chain identity, and the paid jobs between them; beside them, Living Brain, which keeps pages on the build and the Terminal.",
    ids: ["studio", "market", "forecaster", "state", "hedger", "risk", "planner", "brain"],
  },
  {
    id: "witness",
    title: "Sealed and Checked · BNB Chain",
    lede: "Where each day's plans are sealed before the market closes, published, and checked.",
    ids: ["gate", "greenfield", "verifier", "cloudflare", "aws"],
  },
  {
    id: "markets",
    title: "Markets",
    lede: "What a sealed record opens: entries from any wallet, the season's token and vault, and agent launches; beside them, the BNB and USDT prices that size the evaluation budget.",
    ids: ["arena", "flap", "openfour", "atlas", "cmc"],
  },
];

async function build(): Promise<StackList> {
  const load = frameData["../../../../packages/world/src/data/frame-data.json"];
  const [pieces, tn, gf, d] = await Promise.all([
    import("@world/stations/stack/pieces"),
    import("@world/stations/stack/integrations.json"),
    import("@world/stations/stack/greenfield-record.json"),
    load ? load().catch(() => null) : Promise.resolve(null),
  ]);
  const { PIECE_IDS, ROUTES, cards, labels, ctUnix } = pieces;

  let L: ReturnType<typeof labels> | null = null;
  let C: Record<string, Card> | null = null;
  if (d) {
    try {
      L = labels(d);
      // The live mount's clock: once the hosted evaluator's trial has ended, its card reads as run.
      C = cards(d, gf.default, tn.default, {}, now() / 1000);
    } catch (error) {
      console.warn("The stack's cards could not be read from the frame data:", error);
      L = C = null;
    }
  }
  if (!L || !C) {
    // Without the cards the labels need only the fleet's count, which the sealed day's own index carries.
    const day = await loadDay();
    L = labels({ fleet: { count: day.leafCount } });
    C = null;
  }
  const names = L;

  const item = (id: string): PieceItem => {
    const card = C?.[id];
    const label = names[id];
    return {
      id,
      plain: label?.plain ?? card?.name ?? id,
      name: label?.name,
      role: card?.role,
      rows: card?.rows ?? [],
      link: card?.link,
      route: ROUTES[id] ?? "",
    };
  };

  const placed = new Set(ZONES.flatMap((z) => z.ids));
  const zones: Zone[] = ZONES.map((z) => ({ id: z.id, title: z.title, lede: z.lede, pieces: z.ids.filter((id) => PIECE_IDS.includes(id)).map(item) }));
  // A piece the package adds later still gets its line.
  const rest = PIECE_IDS.filter((id) => !placed.has(id));
  if (rest.length) zones.push({ id: "more", title: "More", lede: "", pieces: rest.map(item) });

  const rb = tn.default.read_back;
  const rbUnix = ctUnix(rb?.at_ct);
  return {
    zones: zones.filter((z) => z.pieces.length),
    full: C !== null,
    readBack: rbUnix && rb?.rpc ? { unix: rbUnix, rpc: rb.rpc } : null,
  };
}

let cached: Promise<StackList> | null = null;

/** The list, built once per visit. */
export function useStackList(): Loaded<StackList> {
  const [state, setState] = useState<Loaded<StackList>>({ status: "loading" });
  useEffect(() => {
    let live = true;
    cached ??= build();
    cached.then(
      (data) => live && setState({ status: "ready", data }),
      (error: unknown) => {
        cached = null;
        if (live) setState({ status: "error", error: error instanceof Error ? error : new Error(String(error)) });
      },
    );
    return () => {
      live = false;
    };
  }, []);
  return state;
}
