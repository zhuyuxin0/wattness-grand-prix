export interface NavItem {
  path: string;
  label: string;
  /** What the term stands for, shown as the link's title. */
  gloss: string;
}

export const NAV: NavItem[] = [
  { path: "/", label: "Race weekend", gloss: "The starting grid, qualifying, parc ferme and race day" },
  { path: "/pit-wall", label: "Pit wall", gloss: "The decision desk, with Ness as race engineer" },
  { path: "/standings", label: "Standings", gloss: "Scores per battery on matched conditions" },
  { path: "/stewards", label: "Stewards", gloss: "The verifier anyone can run" },
  { path: "/garage", label: "Garage", gloss: "Where the agents are built and run" },
  { path: "/paddock", label: "Paddock", gloss: "Partners, team data and the season" },
];
