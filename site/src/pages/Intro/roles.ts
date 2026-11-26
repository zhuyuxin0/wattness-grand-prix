// "Start where you are" and "Judging a track?": one entry for each kind of visitor and each sponsor, each opening the
// page of this site that answers them first. The sponsors' entries follow the judges' map in the repository's README and docs/sponsors/; the others are
// the people the record is for. test/roles.test.mjs holds the list to the site: every path is a tab of
// src/shell/tabs.ts, every #id is one its page sets, and every logo is in the world package's registry.
//
// No imports, so the test can read it as it is.

/** A logo in the world package's registry (packages/world/src/kit/logos/registry.ts). */
export type RoleLogo = "bnbchain" | "flap" | "openfour" | "cmc" | "atlas" | "cournot" | "livingbrain";

export interface Role {
  id: string;
  /** The visitor, by the name they know themselves by: a sponsor's own, or a kind of reader. */
  name: string;
  /** What they find there, in one short line. */
  line: string;
  /** The page that answers them: a tab's path, with an in-page #id where one helps. */
  to: string;
  /** A sponsor's logo chip, from the registry, in the order shown. A kind of reader has none. */
  logos?: RoleLogo[];
}

/** "Start where you are": every kind of visitor the record is for, each by the name they know themselves by. */
export const AUDIENCES: readonly Role[] = [
  { id: "newcomers", name: "New to power markets", line: "Play one battery's day: plan, hedge, seal.", to: "/markets/one-plan" },
  { id: "web3", name: "Web3 players", line: "Tokens that launch only once a plan is sealed.", to: "/markets/season" },
  { id: "traders", name: "Traders and analysts", line: "The price scenarios and odds behind each plan.", to: "/agents/forecast" },
  { id: "owners", name: "Battery owners and QSEs", line: "Find your battery: tomorrow's plan, hour by hour.", to: "/fleet#fl-plans" },
  { id: "developers", name: "Developers", line: "Bring your agent: same gate, same checks.", to: "/about/agents" },
  { id: "researchers", name: "Researchers and students", line: "Check any sealed plan yourself, in your browser.", to: "/verify" },
  { id: "investors", name: "Investors", line: "What the record proves, and why it holds.", to: "/about" },
];

/** "Judging a track?": each sponsor by its logo chip, opening the part of the site where its technology works. */
export const SPONSORS: readonly Role[] = [
  { id: "bnb-chain", name: "BNB Chain", logos: ["bnbchain"], line: "The day's plans under one root on BSC mainnet.", to: "/seal" },
  { id: "flap", name: "Flap", logos: ["flap"], line: "Season tokens that launch only on a sealed plan.", to: "/markets/season" },
  { id: "openfour", name: "OpenFour", logos: ["openfour"], line: "No sealed record, no graduation.", to: "/markets/launchpad" },
  { id: "cmc-atlas", name: "CoinMarketCap × Atlas", logos: ["cmc", "atlas"], line: "Signed prices set what checking the plans costs.", to: "/markets/prices#px-sources" },
  { id: "cournot", name: "Cournot", logos: ["cournot"], line: "Weather odds read and sealed before the gate.", to: "/agents/forecast#fc-cournot" },
  { id: "living-brain", name: "Living Brain", logos: ["livingbrain"], line: "The agents' memory, read only as of a cutoff.", to: "/agents/memory" },
];

/** Both groups, in the order shown. */
export const ROLES: readonly Role[] = [...AUDIENCES, ...SPONSORS];

/** A destination's two parts: the tab's path, and the id of the place on its page ("" for its top). */
export function splitTarget(to: string): { path: string; id: string } {
  const at = to.indexOf("#");
  return at < 0 ? { path: to, id: "" } : { path: to.slice(0, at), id: to.slice(at + 1) };
}
