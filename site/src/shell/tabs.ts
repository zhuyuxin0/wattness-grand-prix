import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import type { TabIconName } from "../ui/tab-icons";

// The side panel, the routes and the overview's paths all read this one list,
// in the pipeline's order: a battery's plan, its seal, its check. A group or a
// tab is one entry; a tab belongs to the group above it. Adding a tab is adding
// its entry (and its page folder); nothing else changes.

export interface PanelGroup {
  kind: "group";
  id: string;
  /** Shown as the panel's group heading (uppercase there, by style). */
  label: string;
}

export interface PanelTab {
  kind: "tab";
  id: string;
  /** Plain and functional, in Title Case. Never a racing word. */
  label: string;
  /** The drawing beside the label in the side panel and the phone menu (src/ui/tab-icons.ts), never instead of it. */
  icon: TabIconName;
  /** The route, from the root. */
  path: string;
  /** The page owns the paths under its own: /battery/<resource>, one per battery (scripts/spa-routes.mjs writes each). */
  subpaths?: boolean;
  /** What the tab holds, in one line: its tooltip and its line on the overview. */
  summary: string;
  /** The Grand Prix's word for it, for the glossary and one short note on the page. */
  term?: string;
  /** The tab shows one battery: the selection carries across these tabs. */
  battery?: boolean;
  page: LazyExoticComponent<ComponentType>;
}

export type PanelEntry = PanelGroup | PanelTab;

// A chunk gone after a deploy reloads the page once instead of failing it (lib/chunk-reload.ts). The helper is
// imported only on a failure (it sits in the entry chunk, so that import cannot fail too), which keeps this list free
// of runtime imports for the tests that read it in Node.
type PageModule = { default: ComponentType };
const page = (load: () => Promise<PageModule>) =>
  lazy(() => load().catch((error: unknown) => import("../lib/chunk-reload").then((m) => m.onPageLoadError<PageModule>(error))));

export const PANEL: PanelEntry[] = [
  {
    kind: "tab",
    id: "intro",
    label: "Intro",
    icon: "play",
    path: "/",
    summary: "The Grand Prix: tomorrow's plan for every Texas battery with complete public data, sealed on BNB Chain before the market closes.",
    term: "the starting grid",
    page: page(() => import("../pages/Intro")),
  },

  { kind: "group", id: "today", label: "Today" },
  {
    kind: "tab",
    id: "overview",
    label: "Overview",
    icon: "gauge",
    path: "/overview",
    summary: "The next gate, the latest sealed record, and what happens next.",
    page: page(() => import("../pages/Overview")),
  },

  { kind: "group", id: "plans", label: "Plans" },
  {
    kind: "tab",
    id: "fleet",
    label: "Fleet",
    icon: "grid",
    path: "/fleet",
    subpaths: true,
    summary: "Every sealed plan of the day, with fleet totals, search and sort.",
    term: "the standings",
    page: page(() => import("../pages/Fleet")),
  },
  {
    kind: "tab",
    id: "battery",
    label: "Battery",
    icon: "battery",
    path: "/battery",
    subpaths: true,
    battery: true,
    summary: "One battery's plan in full: its limits, schedule, state of charge and the three plans compared.",
    term: "the pit wall",
    page: page(() => import("../pages/Battery")),
  },

  { kind: "group", id: "agents", label: "Agents" },
  {
    kind: "tab",
    id: "agent-ids",
    label: "Agent IDs",
    icon: "id-card",
    path: "/agents/ids",
    summary: "The agents' ERC-8004 identities on BSC testnet, the evaluator hosted on Amazon Bedrock AgentCore through BNB Agent Studio, and their paid ERC-8183 jobs.",
    page: page(() => import("../pages/AgentIds")),
  },
  {
    kind: "tab",
    id: "forecast",
    label: "Forecast",
    icon: "cloud-sun",
    path: "/agents/forecast",
    battery: true,
    summary: "The price scenarios a plan used, at the battery's node and its hub.",
    page: page(() => import("../pages/Forecast")),
  },
  {
    kind: "tab",
    id: "state",
    label: "State of Charge",
    icon: "battery-charging",
    path: "/agents/state",
    battery: true,
    summary: "The battery's limits and its state of charge, hour by hour, under each plan.",
    page: page(() => import("../pages/StateOfCharge")),
  },
  {
    kind: "tab",
    id: "hedge",
    label: "Hedge",
    icon: "shield",
    path: "/agents/hedge",
    battery: true,
    summary: "ElectronX's published terms and the contracts each plan holds, by hour.",
    page: page(() => import("../pages/Hedge")),
  },
  {
    kind: "tab",
    id: "risk",
    label: "Risk",
    icon: "warning",
    path: "/agents/risk",
    battery: true,
    summary: "Each plan's downside over the price scenarios, and what moves it.",
    page: page(() => import("../pages/Risk")),
  },
  {
    kind: "tab",
    id: "memory",
    label: "Memory",
    icon: "brain",
    path: "/agents/memory",
    summary: "What Living Brain keeps on the build and on the Wattness Terminal: its pages, their connections and the reasoning behind each.",
    term: "team data",
    page: page(() => import("../pages/Memory")),
  },

  { kind: "group", id: "chain", label: "On Chain" },
  {
    kind: "tab",
    id: "seal",
    label: "Seal",
    icon: "stamp",
    path: "/seal",
    summary: "The record on BNB Chain: the root, both receipts, and the gate the contract computes.",
    term: "parc fermé",
    page: page(() => import("../pages/Seal")),
  },
  {
    kind: "tab",
    id: "verify",
    label: "Verify",
    icon: "check-badge",
    path: "/verify",
    subpaths: true,
    summary: "Check any plan against the chain, in your browser.",
    term: "the stewards",
    page: page(() => import("../pages/Verify")),
  },
  {
    kind: "tab",
    id: "files",
    label: "Files",
    icon: "folder",
    path: "/files",
    summary: "The sealed day's files on BNB Greenfield, each with its SHA-256 and its public address.",
    page: page(() => import("../pages/Files")),
  },

  { kind: "group", id: "markets", label: "Markets" },
  {
    kind: "tab",
    id: "season",
    label: "Season",
    icon: "trophy",
    path: "/markets/season",
    summary: "The Flap season: its token launches only on a plan sealed before the gate, and its vault pays contributors for the days their agent sealed in time.",
    term: "the season purse",
    page: page(() => import("../pages/Season")),
  },
  {
    kind: "tab",
    id: "launchpad",
    label: "Launchpad",
    icon: "rocket",
    path: "/markets/launchpad",
    summary: "Agent launches on OpenFour that graduate into a PancakeSwap V2 pool only with a sealed record bound to them, and are refused without one.",
    term: "license to launch",
    page: page(() => import("../pages/Launchpad")),
  },
  {
    kind: "tab",
    id: "prices",
    label: "Prices",
    icon: "candles",
    path: "/markets/prices",
    summary: "BNB and USDT in US dollars from Atlas's signed reports and from CoinMarketCap, side by side, and the evaluation budget they price.",
    term: "the timing screens",
    page: page(() => import("../pages/Prices")),
  },
  {
    kind: "tab",
    id: "one-plan",
    label: "ONE PLAN",
    icon: "gamepad",
    path: "/markets/one-plan",
    summary: "Plan Desert Willow's sealed day yourself and score it over the same 301 price scenarios with the planner's objective.",
    term: "the arcade",
    page: page(() => import("../pages/OnePlan")),
  },

  { kind: "group", id: "about", label: "About" },
  {
    kind: "tab",
    id: "about",
    label: "How It Works",
    icon: "book",
    path: "/about",
    summary: "What the Grand Prix is, how its parts fit, and the glossary.",
    term: "the paddock",
    page: page(() => import("../pages/HowItWorks")),
  },
  {
    kind: "tab",
    id: "stack",
    label: "Tech Stack",
    icon: "layers",
    path: "/about/stack",
    summary: "Every piece the Grand Prix is built from on one map, each with its role and its real integration, contracts and transactions linked.",
    page: page(() => import("../pages/TechStack")),
  },
  {
    kind: "tab",
    id: "add-agent",
    label: "Add Your Agent",
    icon: "robot-plus",
    path: "/about/agents",
    summary: "How anyone seals a plan of their own against the same gate.",
    term: "the garage",
    page: page(() => import("../pages/AddAgent")),
  },
];

export const isTab = (e: PanelEntry): e is PanelTab => e.kind === "tab";

export const TABS: PanelTab[] = PANEL.filter(isTab);

export interface PanelSection {
  group: PanelGroup | null;
  tabs: PanelTab[];
}

/** The list as the panel draws it: each group with the tabs under it. */
export function panelSections(entries: PanelEntry[] = PANEL): PanelSection[] {
  const out: PanelSection[] = [];
  for (const e of entries) {
    if (e.kind === "group") out.push({ group: e, tabs: [] });
    else if (out.length === 0) out.push({ group: null, tabs: [e] });
    else out[out.length - 1]!.tabs.push(e);
  }
  return out;
}

/** The tab a path belongs to: its own path, or a page's subpath. */
export function tabAt(pathname: string): PanelTab | undefined {
  const path = pathname.replace(/\/+$/, "") || "/";
  let best: PanelTab | undefined;
  for (const t of TABS) {
    const hit = path === t.path || (t.subpaths && path.startsWith(`${t.path}/`));
    if (hit && (!best || t.path.length > best.path.length)) best = t;
  }
  return best;
}

export function groupOf(tab: PanelTab): PanelGroup | null {
  let group: PanelGroup | null = null;
  for (const e of PANEL) {
    if (e.kind === "group") group = e;
    else if (e === tab) return group;
  }
  return null;
}

/**
 * The tab ids the 3D world names when a visitor asks to open a tab
 * (packages/world: the story's onRoute, src/story/beats.ts TabId, and the
 * stack's, src/stations/stack/pieces.ts ROUTES), and the tab each one opens
 * here. They are this list's own ids, except the stack's "agents", which is
 * Agent IDs. test/world-tabs.test.mjs reads both of the package's lists and
 * holds this map to them.
 */
export const WORLD_TABS = {
  intro: "intro",
  overview: "overview",
  fleet: "fleet",
  battery: "battery",
  agents: "agent-ids",
  forecast: "forecast",
  state: "state",
  hedge: "hedge",
  risk: "risk",
  memory: "memory",
  seal: "seal",
  verify: "verify",
  files: "files",
  season: "season",
  launchpad: "launchpad",
  prices: "prices",
  "one-plan": "one-plan",
  about: "about",
  "add-agent": "add-agent",
} as const;

/** The tab a 3D route opens; undefined for an id this map does not know. */
export function worldTab(id: string): PanelTab | undefined {
  if (!Object.hasOwn(WORLD_TABS, id)) return undefined;
  const tabId = WORLD_TABS[id as keyof typeof WORLD_TABS];
  return TABS.find((t) => t.id === tabId);
}
