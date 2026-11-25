import { lazy, type ComponentType, type LazyExoticComponent } from "react";

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
  /** The route, from the root. */
  path: string;
  /** The page owns the paths under its own (#/battery/<resource>). */
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

const page = (load: () => Promise<{ default: ComponentType }>) => lazy(load);

export const PANEL: PanelEntry[] = [
  {
    kind: "tab",
    id: "intro",
    label: "Intro",
    path: "/",
    summary: "The Grand Prix: every battery's plan for tomorrow, sealed on BNB Chain before the market closes.",
    term: "the starting grid",
    page: page(() => import("../pages/Intro")),
  },

  { kind: "group", id: "today", label: "Today" },
  {
    kind: "tab",
    id: "overview",
    label: "Overview",
    path: "/overview",
    summary: "The next gate, the latest sealed record, and what happens next.",
    page: page(() => import("../pages/Overview")),
  },

  { kind: "group", id: "plans", label: "Plans" },
  {
    kind: "tab",
    id: "fleet",
    label: "Fleet",
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
    id: "forecast",
    label: "Forecast",
    path: "/agents/forecast",
    battery: true,
    summary: "The price scenarios a plan used, at the battery's node and its hub.",
    page: page(() => import("../pages/Forecast")),
  },
  {
    kind: "tab",
    id: "state",
    label: "State of Charge",
    path: "/agents/state",
    battery: true,
    summary: "The battery's limits and its state of charge, hour by hour, under each plan.",
    page: page(() => import("../pages/StateOfCharge")),
  },
  {
    kind: "tab",
    id: "hedge",
    label: "Hedge",
    path: "/agents/hedge",
    battery: true,
    summary: "ElectronX's published terms and the contracts each plan holds, by hour.",
    page: page(() => import("../pages/Hedge")),
  },
  {
    kind: "tab",
    id: "risk",
    label: "Risk",
    path: "/agents/risk",
    battery: true,
    summary: "Each plan's downside over the price scenarios, and what moves it.",
    page: page(() => import("../pages/Risk")),
  },
  {
    kind: "tab",
    id: "memory",
    label: "Memory",
    path: "/agents/memory",
    summary: "What the agents remember: Living Brain pages, their connections and the reasoning behind each.",
    term: "team data",
    page: page(() => import("../pages/Memory")),
  },

  { kind: "group", id: "chain", label: "On Chain" },
  {
    kind: "tab",
    id: "seal",
    label: "Seal",
    path: "/seal",
    summary: "The record on BNB Chain: the root, both receipts, and the gate the contract computes.",
    term: "parc ferme",
    page: page(() => import("../pages/Seal")),
  },
  {
    kind: "tab",
    id: "verify",
    label: "Verify",
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
    path: "/files",
    summary: "The sealed day's files on BNB Greenfield, each with its SHA-256 and its public address.",
    page: page(() => import("../pages/Files")),
  },

  { kind: "group", id: "about", label: "About" },
  {
    kind: "tab",
    id: "about",
    label: "How It Works",
    path: "/about",
    summary: "What the Grand Prix is, how its parts fit, and the glossary.",
    term: "the paddock",
    page: page(() => import("../pages/HowItWorks")),
  },
  {
    kind: "tab",
    id: "add-agent",
    label: "Add Your Agent",
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
