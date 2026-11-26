// The 3D world's three mounts, declared at the site's boundary.
//
// packages/world (the story, ONE PLAN and the stack) is imported from source as
// @world (vite.config.ts), only by dynamic import inside the tab that shows each
// mount. The site type-checks with stricter options than the package
// (noUncheckedIndexedAccess, noUnusedLocals, noUnusedParameters), so it checks
// its own calls against these declarations, written by hand from
// packages/world/README.md and the mounts' own types, and never compiles the
// package's sources: there is no `paths` entry for @world. A change to a
// mount's options or handle is made here too.

declare module "@world/story/mount" {
  /** The site tab a beat's "Open <tab>" control names (packages/world/src/story/beats.ts). */
  export type TabId =
    | "intro"
    | "overview"
    | "fleet"
    | "battery"
    | "forecast"
    | "state"
    | "hedge"
    | "risk"
    | "memory"
    | "seal"
    | "verify"
    | "files"
    | "season"
    | "launchpad"
    | "one-plan"
    | "about"
    | "add-agent";

  /** One stop of the story. `name` is the plain meaning; `term` the racing term, where the beat has one. */
  export interface Beat {
    index: number;
    id: string;
    name: string;
    term: string | null;
    part: string;
    tab: TabId | null;
    frame: string;
  }

  export type StoryEvent = "ready" | "beat" | "route" | "end" | "error";

  export interface MountOptions {
    /** "site" (the default): the visitor moves it. "capture": the caller poses the film with seek(t). */
    mode?: "site" | "capture";
    /** The site's theme, recorded on the story's root as data-site-theme. The 3D and its chrome stay dark. */
    theme?: "dark" | "light";
    /** A beat's index or id ("desert-willow", "the-map", "stack", ...). In capture, the second to open on. */
    startBeat?: number | string;
    /** Called by a beat's "Open <tab>" button with one of the site's tab ids. */
    onRoute?(tab: TabId): void;
    /** Capture only: the 3:00 master or the 90-second cut. */
    cut?: "master" | "90s";
    /** Each frame's own caption (the site's default), the film's line for each row (capture's), or none. */
    captions?: "frame" | "film" | "none";
    /** Drawing-buffer pixels per CSS pixel; on the site, min(devicePixelRatio, 2). */
    dpr?: number;
    /** Rests as stills, with cross-fades between them; the visitor's prefers-reduced-motion by default. */
    reducedMotion?: boolean;
  }

  export interface StoryHandle {
    /** The stops in order, filled once the story is ready. */
    readonly beats: Beat[];
    /** Resolves once the first picture is on screen; rejects if the story cannot run here. */
    readonly ready: Promise<void>;
    /** A beat's index or id. */
    goTo(beat: number | string): void;
    /**
     * Each returns its own unsubscribe. The package types every payload as unknown; these name what each event
     * carries (story/site.ts and story/mount.ts emit them).
     */
    on(event: "ready", fn: () => void): () => void;
    on(event: "beat" | "end", fn: (beat: Beat) => void): () => void;
    on(event: "route", fn: (tab: TabId) => void): () => void;
    on(event: "error", fn: (error: { frame?: string; error: string }) => void): () => void;
    /** Capture: poses the film at t seconds and resolves once the frame has settled. */
    seek(t: number, dt?: number): Promise<void>;
    dispose(): void;
  }

  export function mountStory(el: HTMLElement, opts?: MountOptions): StoryHandle;
}

declare module "@world/game" {
  type Hex = `0x${string}`;
  type ArmId = "A" | "B" | "C";

  /** A plan: the schedule dial's step (0 to 20) and the glass, whole contracts for each of 24 hours (sold positive). */
  export interface PlayerPlan {
    step: number;
    glass: readonly number[];
  }

  /** A plan's score over the field's scenarios, in integer micro-dollars unless named otherwise. */
  export interface Score {
    /** Each scenario's day total. */
    totals: Float64Array;
    mean: number;
    /** The CVaR of loss at the field's alpha: the worst tenth's average loss. */
    cvar: number;
    /** The planner's objective: the mean minus lambda (the field's lambdaPpm) times cvar. */
    objective: number;
    /** Days that lose money. */
    losing: number;
    worst: number;
    best: number;
    collateralCents: number;
    /** Each scenario's $250 bin, the bins' counts, and how many fell past either end. */
    bin: Int16Array;
    hist: number[];
    under: number;
    over: number;
    /** The worst whole scenarios and the boundary one, with weights in ppm of a scenario. */
    tail: { k: number; weightPpm: number }[];
  }

  export interface Played {
    /** The schedule, kW by hour. */
    kw: number[];
    /** Each hour's contract cap. */
    caps: number[];
    /** The contracts the schedule backs: the glass, each hour cut to its cap. */
    q: number[];
    /** Per hour, the share of the glass the schedule does not deliver, 0 to 1. */
    short: number[];
    /** Glass over its cap: the plan cannot be sealed as it stands. */
    lit: boolean;
    score: Score;
    /** Every limit the plan breaks; empty when it keeps them all. */
    limits: string[];
  }

  export interface Arm {
    id: ArmId;
    method: string;
    kw: readonly number[];
    contracts: readonly number[];
    expectedUusd: number;
    cvarUusd: number;
    objectiveUusd: number;
    collateralCents: number;
  }

  /**
   * One sealed day's field: the battery, its limits, the hedge's terms, the risk rule and the three plans. These are
   * the fields a page reads; the package's own Field also carries the scenarios' prices.
   */
  export interface Field {
    operatingDay: string;
    resource: string;
    name: string;
    settlementPoint: string;
    hub: string;
    /** Price scenarios. */
    n: number;
    powerKw: number;
    energyKwh: number;
    roundTripPpm: number;
    socMinPpm: number;
    socMaxPpm: number;
    socOpenPpm: number;
    socEndMinPpm: number;
    maxCyclesPpm: number;
    wearCentsPerMwh: number;
    entryCents: readonly number[];
    rangeCents: readonly [number, number];
    feeCentsPerContract: number;
    sizeKwh: number;
    maxContractsPerHour: number;
    collateralBudgetCents: number;
    alphaPpm: number;
    lambdaPpm: number;
    scenarioDigest: string;
    arms: Readonly<Record<ArmId, Arm>>;
    /** The agent's sealed record the field comes from. */
    record: {
      root: string;
      leaf: string;
      leafPosition: number;
      leafCount: number;
      gateUnix: number;
      sealedUnix: number;
      agent: string;
      scopeLabel: string;
    };
  }

  /** The visitor's wallet. */
  export interface Eip1193 {
    request(args: { method: string; params?: unknown }): Promise<unknown>;
    on?(event: string, fn: (...args: unknown[]) => void): void;
    removeListener?(event: string, fn: (...args: unknown[]) => void): void;
  }

  /** A plan as sealed: one canonical JSON document (gate-record.arena-plan.v1), integers only. */
  export interface ArenaLeaf {
    schema: "gate-record.arena-plan.v1";
    game: "ONE PLAN";
    market: "ERCOT";
    operating_day: string;
    resource: string;
    settlement_point: string;
    scope_label: string;
    /** The field it was played on: the agent's sealed record, the battery's leaf in it, the scenario set. */
    field: {
      record_root: string;
      record_leaf: string;
      record_leaf_position: number;
      scenarios_sha256: string;
      scenarios: number;
      alpha_ppm: number;
      lambda_ppm: number;
    };
    plan: { dial_step: number; dial_steps: number; kw: number[]; contracts: number[] };
    score: { expected_uusd: number; cvar_uusd: number; objective_uusd: number; collateral_cents: number };
    committer: string;
    salt: Hex;
  }

  /** A sealed plan, read back from BSC testnet. */
  export interface SealReceipt {
    chainId: 97;
    contract: Hex;
    txHash: Hex;
    txUrl: string;
    blockNumber: number;
    blockTime: number;
    gate: number;
    secondsBeforeGate: number;
    key: Hex;
    committer: Hex;
    /** The plan's document, its canonical JSON, its leaf and the one-leaf record GateRecord holds. */
    record: {
      doc: ArenaLeaf;
      json: string;
      leaf: Hex;
      root: Hex;
      leafCount: 1;
      od: number;
      scopeLabel: string;
      scope: Hex;
      codeHash: Hex;
    };
  }

  export interface CameraPose {
    target: [number, number, number];
    az: number;
    el: number;
    dist: number;
    vfov: number;
    shift?: [number, number];
    near?: number;
    far?: number;
  }

  export interface OnePlanOptions {
    /** The deck under the stage follows it. The stage stays dark. Default "dark". */
    theme?: "dark" | "light";
    /** "play" (the default): the stage at 16:9 of the element's width, then the deck. "story": the controls over the stage. */
    mode?: "play" | "story";
    /** Called once the transaction is mined and its Committed event read back. */
    onSeal?: (receipt: SealReceipt) => void;
    /** The frame data: Desert Willow's sealed day. The synced frame data by default. */
    data?: unknown;
    /** window.ethereum by default. */
    ethereum?: Eip1193 | null;
    /** The record's code hash; zero by default. */
    codeHash?: Hex;
    /** The opening plan; the planner's sealed plan (C) by default. */
    plan?: PlayerPlan;
    /** Unix seconds for the gate check; the page's clock by default. */
    now?: () => number;
    /** Drawing-buffer pixels per CSS pixel; min(devicePixelRatio, 2) by default. */
    dpr?: number;
    /** A camera pose, for a host that frames the cabinet itself. */
    camera?: CameraPose;
    /** One frame, no animation. */
    still?: boolean;
    /** Where the field's sealed record is shown; the seal card links it once the field's gate has passed. */
    recordHref?: string;
  }

  export interface OnePlanHandle {
    readonly ready: Promise<void>;
    field(): Field;
    getPlan(): PlayerPlan;
    /** The field eases and the coins hop unless animate is false. */
    setPlan(plan: PlayerPlan, o?: { animate?: boolean }): Played;
    played(): Played;
    setTheme(theme: "dark" | "light"): void;
    /** Selects an hour on the rack, or none. */
    select(hour: number | null): void;
    /** Draws a frame now. */
    render(): void;
    dispose(): void;
  }

  export function mountOnePlan(el: HTMLElement, opts?: OnePlanOptions): OnePlanHandle;
}

declare module "@world/stations/stack/mount" {
  export type StackTheme = "dark" | "light";

  export interface StackOptions {
    /** The 3D's own theme; the site passes "dark" in either page theme. Default "dark". */
    theme?: StackTheme;
    /** Called with the site tab that shows a piece (packages/world/src/stations/stack/pieces.ts ROUTES). */
    onRoute?: (tab: string) => void;
    /** The frame data; the synced frame data by default. */
    data?: unknown;
    /** The key card, bottom right (hidden under 720 px). Default true. */
    key?: boolean;
    /** Drawing-buffer pixels per CSS pixel; min(devicePixelRatio, 2) by default. */
    dpr?: number;
    /** The moving marks along the lines hold still; the visitor's prefers-reduced-motion by default. */
    still?: boolean;
  }

  export interface StackHandle {
    /** Settles once the space is built and drawing. */
    readonly ready: Promise<void>;
    /** Every piece's id. */
    readonly pieces: readonly string[];
    /** Opens a piece's card as if pointed at; null closes it. */
    hover(id: string | null): void;
    /** A point on screen where the piece is under the pointer, in CSS px from the element's top left; null out of view. */
    screenOf(id: string): { x: number; y: number } | null;
    dispose(): void;
  }

  export function mountStack(el: HTMLElement, opts?: StackOptions): StackHandle;
}
