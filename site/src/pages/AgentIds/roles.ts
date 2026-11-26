// Each agent's face on its card: its instrument in 3D, rendered from the world's garage (public/renders/agent-<role>,
// each with its receipt), its icon and one plain line on what it does. The six roles' icons are the stack's role glyphs
// (packages/world/src/stations/stack/glyphs.ts, copied: the site never imports the 3D package statically), drawn in
// the Terminal's 16-unit glyph hand, each in the color of the flow that feeds it. The evaluator has no role glyph: it
// wears Verify's tab icon, since the check it sells is the one Verify runs.

export interface RoleFace {
  /** The still's name in public/renders/. */
  still: string;
  /** What the still shows. */
  alt: string;
  /** Whose figures the still draws, and their day. */
  scope: string;
  /** One plain line: what the agent does. */
  does: string;
  /** The stack's glyph (16-unit box), or null for the evaluator. */
  glyph: string | null;
  /** The glyph's color on the night ground and on the light page. */
  color: { dark: string; light: string };
}

export const FACES: Record<string, RoleFace> = {
  "market-reader": {
    still: "agent-market-reader",
    alt: "The Market reader's file wall in 3D: one tile for each of the 527 input files of Desert Willow's sealed Nov 26 plan, lit by its SHA-256",
    scope: "Desert Willow's Nov 26 inputs",
    does: "Reads the Wattness Terminal's price files and pins each one by its SHA-256.",
    glyph: "M4.75 1.75v12.5M3.25 4.75h3v5.5h-3zM11.25 1.75v12.5M9.75 6.25h3v4.5h-3z",
    color: { dark: "#b481f0", light: "#6345b1" },
  },
  "state-keeper": {
    still: "agent-state-keeper",
    alt: "The State keeper's battery column in 3D: Desert Willow's state of charge through its Nov 26 plan as a helix round the column, inside its 5% and 95% limits",
    scope: "Desert Willow's Nov 26 plan",
    does: "Keeps the battery's limits, hour by hour: power, energy, state of charge and cycles.",
    glyph: "M3.25 4.75h9a1 1 0 0 1 1 1v4.5a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-4.5a1 1 0 0 1 1-1zM15 6.75v2.5M5 7v2M7.25 7v2",
    color: { dark: "#2ec7a6", light: "#1fae8f" },
  },
  forecaster: {
    still: "agent-forecaster",
    alt: "The Forecaster's chart wall in 3D: the day-ahead price forecast for Desert Willow's Nov 26 plan over the fan of its 301 price scenarios",
    scope: "Desert Willow's Nov 26 forecast",
    does: "Forecasts tomorrow's prices at each battery's hub and node, as a fan of price scenarios.",
    glyph: "M1.75 10.75l2.5-2.5 2.25 1.5M6.5 9.75L14.25 3.75M6.5 9.75h7.75M6.5 9.75l7.75 4",
    color: { dark: "#b481f0", light: "#6345b1" },
  },
  hedger: {
    still: "agent-hedger",
    alt: "The Hedger's strip in 3D: Desert Willow's 24 hours in its sealed Nov 26 plan, with glass tiles on the hedged hours",
    scope: "Desert Willow's Nov 26 plan",
    does: "Sizes the hedge, hour by hour, on ElectronX's published contract terms.",
    glyph: "M2 3.25h12M2 12.75h12M2.75 10l2.5-3.5 2.5 2.75 2.75-4.25 2.75 3",
    color: { dark: "#eb6834", light: "#e35f2a" },
  },
  "risk-officer": {
    still: "agent-risk-officer",
    alt: "The Risk officer's coin board in 3D: the 301 scenario totals of Desert Willow's sealed Nov 26 plan as coins in $250 slots, the worst tenth rimmed",
    scope: "Desert Willow's Nov 26 plan",
    does: "Weighs the bad days: the average of the worst tenth of the scenarios.",
    glyph: "M1.75 13.25h12.5M2.25 13c2.5 0 3.25-9.25 5.75-9.25S11.25 13 13.75 13M5 13.25V8.5",
    color: { dark: "#c6cfd9", light: "#636a75" },
  },
  planner: {
    still: "agent-planner",
    alt: "The Planner's three boards in 3D: Desert Willow's Nov 26 plans A, B and C, the sealed plan C edged in BNB yellow",
    scope: "Desert Willow's Nov 26 plans",
    does: "Solves each battery's charge and discharge by hour and seals the day's plans as one root; for Desert Willow it scores three plans and keeps the best.",
    glyph: "M2 3.75h9M2 8h9M2 12.25h5.25M9.25 12.25l1.75 1.75 3.25-3.5",
    color: { dark: "#F0B90B", light: "#b08405" },
  },
  evaluator: {
    still: "agent-evaluator",
    alt: "The evaluator's bench in 3D: ten check lamps, lit for each check that passed on Desert Willow's Nov 26 plan",
    scope: "Its checks of Desert Willow's Nov 26 plan",
    does: "Checks a sealed plan against its GateRecord commitment, and sells that check as a paid job.",
    glyph: null,
    color: { dark: "#2ec7a6", light: "#1fae8f" },
  },
};
