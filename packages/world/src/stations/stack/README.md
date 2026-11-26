# The stack

The finale's space (STACK.md): every piece the plan passes through, as one lit space. The same build serves the
storyboard's stills (the frame lab) and the site (a live mount).

## On the site

```ts
import { mountStack } from './stations/stack/mount';

const stack = mountStack(el, {
  theme: 'dark',                    // the 3D holds its own theme; 'light' for a light cut
  onRoute: (tab) => go(`#/${tab}`), // the site tab that shows the clicked piece
  // data: frameData,               // frame-data.json's contents; default: src/data/frame-data.json
  // key: true,                     // the key card, bottom right
});
await stack.ready;
stack.hover('gate');                // a piece hovered as if pointed at (null: none)
stack.screenOf('gate');             // { x, y }: a point where that piece is under the pointer
stack.dispose();
```

- **Pointer:** hovering a piece opens its card beside it (its role and its real integration: endpoints, contracts and
  transactions, linked to their explorers) and its chip; a click calls `onRoute(tab)`. With a card open, the pointer
  can cross other pieces on its way to the card's links and its button for a short grace.
- **Touch:** the first tap opens the card, a second tap on the piece (or the card's button) routes; a tap elsewhere
  closes it.
- **Keyboard:** every piece is a button in a visually hidden list; focus opens its card, Enter routes, Escape closes.
- **Phone width** (under 720 px): no labels, titles or chips; a tap's card names the piece.
- Reduced motion holds the comets still. The loop pauses out of view and in a hidden tab.

Tabs (`pieces.ts` `ROUTES`): ERCOT `fleet`; the Terminal `about`; Cournot `risk`; ElectronX `hedge`; Agent Studio
and the hosted agents (AgentCore: the evaluator and the Forecaster) `agents` (the site's Agent IDs); the Forecaster and
the Market reader `forecast`; the State keeper `state`; the Hedger `hedge`; the Risk officer `risk`; the Planner
`battery`; Living Brain `memory`; GateRecord `seal`; Greenfield and the edge Worker (Cloudflare) `files`; the Verifier
`verify`; Atlas and CoinMarketCap `prices`; the Arena `add-agent`; Flap `season`; OpenFour `launchpad`.

## Where the words and figures come from

- `pieces.ts`: each piece's label (plain meaning first, name second), card and tab.
- `frame-data.json` (`ctx.data`), `greenfield-record.json`, and `integrations.json`: the sponsor flows on BSC testnet
  that the frame data does not carry yet (addresses, transactions, blocks), each transaction read back on a public RPC,
  and the edge Worker's address with what its `/` and one `/verify` answered. A piece is lit when its record is there
  (`space.ts` `states`).
- The hosted agents: both run on BNB Agent Studio's managed trial, which ends Nov 27, 2026 at 14:37 CT. The live mount
  passes its clock (`pieces.ts` `hosting`), so after that the AWS piece reads as run, its pods' lamps dim and its card
  gives the span each ran instead of the agent cards' links.
- Tickers are off (`SHOW_TICKERS`): the event's rule on testnet tickers is unanswered.

## Stills

`stack.rest` (S01), `stack.seal` and `stack.seal-late` (S02), `stack.inspect` (S03), `stack.close` (S04),
`stack.cube-check`, and `stack.hover.<piece>`: the live hover state at its end, one per kind of piece.

```sh
sh scripts/serve.sh 15194
node scripts/render.mjs --port 15194 --frames stack.rest,stack.inspect --scale 2 --out storyboard/frames
node src/stations/stack/demo/check.mjs --port 15194 --out out/stack-check   # the live mount, every piece
sh scripts/stop.sh 15194
```

`demo/index.html` mounts it alone (`/src/stations/stack/demo/index.html?theme=dark`).
