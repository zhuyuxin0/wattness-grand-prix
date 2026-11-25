export const PRODUCT_NAME = "Wattness Grand Prix";
export const PRODUCT_SHORT = "Grand Prix";

/** Every figure on the site carries this line. */
export const SOURCE_LINE = "Data: ERCOT. Calculation and display: Wattness.";
export const SHADOW_NOTE = "Shadow plans, computed from public data. They are never used to operate the batteries.";

export const REPO_URL = "https://github.com/zhuyuxin0/wattness-grand-prix";
export const TERMINAL_URL = "https://wattness.tech";

export const CENTRAL_TZ = "America/Chicago";
export const BANGKOK_TZ = "Asia/Bangkok";

/** ERCOT's day-ahead gate, in market time. */
export const GATE_HOUR_CT = 10;

export const SHOWCASE = {
  resource: "DSWL_ESS_ESR1",
  name: "Desert Willow",
  settlementPoint: "DSWL_BES1",
  hub: "HB_NORTH",
} as const;

export const CONTRACT_ADDRESS = "0x2922c68cE15EB3e83B7f43b136e981dDc4262876";

/** Product vocabulary: the race weekend's terms and what each one is. */
export const GLOSSARY = {
  startingGrid: "ERCOT's grid of about 300 real batteries",
  qualifying: "agents plan tomorrow",
  parcFerme: "10:00 CT: plans sealed on BNB Chain; no changes, a late seal reverts",
  raceDay: "the operating day; real-time prices are the telemetry",
  weatherRadar: "Cournot's Texas weather odds",
  pitWall: "the decision desk, with Ness as race engineer",
  teamData: "Living Brain memory",
  garage: "BNB Agent Studio builds the agents and AWS runs them",
  stewards: "the verifier anyone can run",
  standings: "scores per battery on matched conditions",
  seasonPurse: "Flap season launch",
  licenseToLaunch: "OpenFour evidence-gated graduation",
  timingScreens: "Atlas and CoinMarketCap prices",
} as const;
