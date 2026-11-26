import type { ReactNode } from "react";
import { REPO_URL } from "../../config";
import { minSec } from "../../lib/clock";
import { formatInt } from "../../lib/format";
import { formatAmount, formatPrice, formatTokens, ratio } from "../../lib/amounts";
import { addressUrl, blockUrl, txUrl, useTestnet, type Live } from "../../lib/testnet";
import { dualTime, formatOperatingDay } from "../../lib/time";
import { Glyph, Loading, PageHeader, ParcFerme, Section, Stat, StatRow, type CheckItem, type CheckItProps } from "../../ui";
import { LiveRead } from "../../ui/LiveRead";
import { sponsors, useLogoRegistry } from "../TechStack/sponsors";
import { OPENFOUR, type StepId } from "./addresses";
import { readLaunch, type LaunchRead, type StepView } from "./chain";
import { LaunchCard } from "./LaunchCard";
import { LaunchObject } from "./LaunchObject";
import { LAUNCHES } from "./replay";
import "./styles.css";

// Launchpad: OpenFour's evidence-gated graduation (modules/openfour). It opens on the launch card, PLNR as a
// Four.meme user follows a token, replayed from its BSC testnet transactions; then the custom migrate step, the
// launch's transactions in order with the refused attempt and the granted one, and the token, its pair and reserves
// read live. Each section's addresses and transactions sit in its one Check it list.

const SOURCE = (
  <>
    Read in your browser from BSC testnet (chain 97) over public RPC, no wallet: OpenFour Core, the migrate module, the vault, GateRecord, the pair and each transaction's
    receipt. Contracts:{" "}
    <a href={`${REPO_URL}/tree/main/modules/openfour`} target="_blank" rel="noreferrer">
      modules/openfour
    </a>
    .
  </>
);

const SCOPE_LABEL = "gate-record/ercot-da-energy";

/** A whole number when it is one, otherwise up to four places: "0.1 WBNB". */
function coin(v: bigint, symbol: string): string {
  const text = formatAmount(v, 18, 4).replace(/\.?0+$/, "");
  return `${text} ${symbol}`;
}

const tokens = (v: bigint, symbol: string) => `${formatTokens(v)} ${symbol}`;

const odDay = (od: number) => {
  const s = String(od);
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
};

const isAgent = (a: string) => a.toLowerCase() === OPENFOUR.launch.agent.toLowerCase();

const tx = (label: string, hash: string, note?: ReactNode): CheckItem => ({ kind: "transaction", label, value: hash, href: txUrl(hash), copy: `${label} transaction hash`, note });
const addr = (label: string, value: string, note?: ReactNode): CheckItem => ({ kind: "address", label, value, href: addressUrl(value), copy: `${label} address`, note });

function When({ unix }: { unix: number }) {
  const t = dualTime(unix);
  return (
    <span className="launch-when">
      <span className="num">{t.ct}</span>
      {t.yours && <span className="muted num">{t.yours}</span>}
    </span>
  );
}

// ---------------------------------------------------------------- the gate

function Conditions({ l }: { l: LaunchRead }) {
  const g = l.gate;
  const sold = l.token.saleAmount - l.vault.remainingForSale;
  return (
    <div className="launch-conditions">
      <article className="launch-card">
        <header className="launch-card__head">
          <h3 className="launch-card__title">Liquidity</h3>
          {g.liquidityReady && (
            <span className="launch-held">
              <Glyph name="check" />
              Holds
            </span>
          )}
        </header>
        <p>
          {g.liquidity === "soldOut"
            ? "The vault's own predicate, read from the vault: the sale has sold out."
            : `The vault's own predicate, read from the vault: at least ${coin(g.minQuoteRaised, l.token.quoteSymbol)} raised.`}
        </p>
        <dl className="launch-dl">
          <div>
            <dt>Sold on the curve</dt>
            <dd className="num">
              {tokens(sold, l.token.symbol)} of {tokens(l.token.saleAmount, l.token.symbol)}
            </dd>
          </div>
          <div>
            <dt>Raised</dt>
            <dd className="num">
              {coin(l.vault.totalRaised, l.token.quoteSymbol)} of a {coin(l.token.raiseAmount, l.token.quoteSymbol)} raise
            </dd>
          </div>
        </dl>
      </article>

      <article className="launch-card">
        <header className="launch-card__head">
          <h3 className="launch-card__title">Evidence</h3>
          {g.evidenceBound && g.evidenceHolds && <ParcFerme state="sealed" size="sm" label="Bound and holds" />}
        </header>
        <p>
          A GateRecord record bound to this launch. It is found by <code>keyOf(agent, scope, day)</code>, so only the agent's own sealed record qualifies, and its committer, scope,
          day and root must all match.
        </p>
        <dl className="launch-dl">
          <div>
            <dt>Agent</dt>
            <dd>{isAgent(g.agent) ? "The Wattness agent, the planner's wallet that seals each day's record" : "Another agent's wallet"}</dd>
          </div>
          <div>
            <dt>Scope</dt>
            <dd>
              <code>{SCOPE_LABEL}</code>
            </dd>
          </div>
          <div>
            <dt>Earliest day</dt>
            <dd>{formatOperatingDay(odDay(g.minOd))}</dd>
          </div>
          <div>
            <dt>Batteries</dt>
            <dd className="num">At least {formatInt(g.minLeafCount)}</dd>
          </div>
          <div>
            <dt>Code hash</dt>
            <dd>{g.codeHash ? "One pinned version of the planner's code" : "Any"}</dd>
          </div>
          <div>
            <dt>Timing</dt>
            <dd>Committed before that day's 10:00 CT gate{g.outcomeStage ? `, with settlement stage ${g.outcomeStage} linked` : ""}</dd>
          </div>
        </dl>
      </article>
    </div>
  );
}

// ---------------------------------------------------------------- the steps

function stepText(id: StepId, l: LaunchRead, s: StepView): { title: string; body: ReactNode } {
  const sym = l.token.symbol;
  const quote = l.token.quoteSymbol;
  switch (id) {
    case "module":
      return {
        title: "Deploy the migrate module",
        body: (
          <>
            Our evidence-gated Migrate, <code>{l.gate.tag}</code>. Each launch runs its own instance behind one beacon.
          </>
        ),
      };
    case "preset":
      return {
        title: "Add the preset",
        body: (
          <>
            {OPENFOUR.preset.name}, preset <span className="num">{OPENFOUR.preset.id}</span> on our Registry: OpenFour's Bonding V1 with this Migrate in place of the standard one.
            Token, Vault, Curve and Trade stay standard.
          </>
        ),
      };
    case "create":
      return {
        title: `Create ${sym}`,
        body: (
          <>
            {l.token.name} ({sym}) on Core with that preset: <span className="num">{tokens(l.token.maxSupply, sym)}</span>, of which{" "}
            <span className="num">{tokens(l.token.saleAmount, sym)}</span> on the curve for a <span className="num">{coin(l.token.raiseAmount, quote)}</span> raise.
          </>
        ),
      };
    case "refused":
      return {
        title: "Graduate: refused",
        body: (
          <>
            The sale had sold out, so liquidity held, but no sealed record was bound to the launch. <code>graduate()</code> reverted with <code>EvidenceMissing</code>.
          </>
        ),
      };
    case "bind": {
      const r = l.record;
      return {
        title: "Bind the sealed record",
        body: (
          <>
            <code>bindEvidence</code>
            {s.bound && <> for {formatOperatingDay(odDay(s.bound.od))}</>} checked the Wattness agent's record in GateRecord
            {r && (
              <>
                : <span className="num">{formatInt(r.leafCount)}</span> batteries, committed <span className="num">{minSec(r.gate - r.committedAt)}</span> before its gate
              </>
            )}
            , and bound it to the launch.
          </>
        ),
      };
    }
    case "graduated":
      return {
        title: "Graduate: granted",
        body: s.graduated ? (
          <>
            With the record bound, <code>graduate()</code> moved <span className="num">{tokens(s.graduated.tokenAmount, sym)}</span> and{" "}
            <span className="num">{coin(s.graduated.quoteAmount, quote)}</span> into an empty PancakeSwap V2 pair and sent its LP tokens to <code>0x…dEaD</code>.
          </>
        ) : (
          <>
            With the record bound, <code>graduate()</code> moved the vault's tokens and its raise into an empty PancakeSwap V2 pair.
          </>
        ),
      };
  }
}

function Steps({ l }: { l: LaunchRead }) {
  return (
    <ol className="launch-steps">
      {l.steps.map((s, i) => {
        const t = stepText(s.id, l, s);
        return (
          <li key={s.id} className={`launch-step${s.ok ? "" : " launch-step--refused"}`}>
            <span className="launch-step__n num" aria-hidden="true">
              {i + 1}
            </span>
            <div className="launch-step__main">
              <div className="launch-step__head">
                <h3 className="launch-step__title">{t.title}</h3>
                <span className={s.ok ? "launch-ok" : "launch-bad"}>
                  <Glyph name={s.ok ? "check" : "close"} />
                  {s.ok ? "Succeeded" : "Reverted"}
                </span>
              </div>
              <p className="launch-step__body">{t.body}</p>
              <p className="launch-step__tx">
                <a href={txUrl(s.hash)} target="_blank" rel="noreferrer" className="launch-step__open">
                  Transaction
                  <Glyph name="popout" />
                </a>
                <span className="muted">
                  Block{" "}
                  <a className="num" href={blockUrl(s.blockNumber)} target="_blank" rel="noreferrer">
                    {formatInt(Number(s.blockNumber))}
                  </a>
                </span>
                <When unix={s.time} />
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// ---------------------------------------------------------------- today

function Today({ l }: { l: LaunchRead }) {
  const p = l.pool;
  const r = l.record;
  const e = l.gate.evidence;
  const price = p ? ratio(p.reserveQuote, p.reserveToken) : null;
  const burned = p ? p.lpAtSink + p.lpAtZero : 0n;
  return (
    <>
      <StatRow>
        <Stat label="Phase" value={l.vault.phase} note={l.graduated ? "Graduated into the pair" : "Not graduated"} />
        {p && <Stat label={`Reserve, ${l.token.quoteSymbol}`} value={coin(p.reserveQuote, l.token.quoteSymbol)} note="In the PancakeSwap V2 pair" />}
        {p && <Stat label={`Reserve, ${l.token.symbol}`} value={tokens(p.reserveToken, l.token.symbol)} note="In the PancakeSwap V2 pair" />}
        {price !== null && (
          <Stat
            label="Pool price"
            value={formatPrice(price)}
            unit={`${l.token.quoteSymbol} per ${l.token.symbol}`}
            note="From the reserves, on testnet. A token's price says nothing about an agent's plans."
          />
        )}
      </StatRow>

      <div className="launch-today">
        <div>
          <h3 className="launch-sub">The token</h3>
          <dl className="launch-dl">
            <div>
              <dt>{l.token.symbol}</dt>
              <dd>
                {l.token.name}: <span className="num">{tokens(l.token.totalSupply, l.token.symbol)}</span> in supply, created in block{" "}
                <a className="num" href={blockUrl(l.token.createBlock)} target="_blank" rel="noreferrer">
                  {formatInt(Number(l.token.createBlock))}
                </a>{" "}
                with preset <span className="num">{String(l.token.presetId)}</span>.
              </dd>
            </div>
            <div>
              <dt>Its migrate</dt>
              <dd>
                <code>{l.gate.tag}</code> version {l.gate.version}, its own instance, reading GateRecord
              </dd>
            </div>
          </dl>
        </div>

        <div>
          <h3 className="launch-sub">The bound record</h3>
          {r && e ? (
            <dl className="launch-dl">
              <div>
                <dt>Operating day</dt>
                <dd>{formatOperatingDay(odDay(r.od))}</dd>
              </div>
              <div>
                <dt>Batteries</dt>
                <dd className="num">{formatInt(r.leafCount)}</dd>
              </div>
              <div>
                <dt>Sealed</dt>
                <dd>
                  <When unix={r.committedAt} />
                  <p className="launch-dl__note">
                    Block{" "}
                    <a className="num" href={blockUrl(r.blockNumber)} target="_blank" rel="noreferrer">
                      {formatInt(r.blockNumber)}
                    </a>
                    , <span className="num">{minSec(r.gate - r.committedAt)}</span> before its gate
                  </p>
                </dd>
              </div>
              <div>
                <dt>Bound</dt>
                <dd>
                  <When unix={e.boundAt} />
                  <p className="launch-dl__note">By the token's {e.boundBy.toLowerCase() === l.token.creator.toLowerCase() ? "creator" : "agent"}</p>
                </dd>
              </div>
            </dl>
          ) : (
            <p className="muted">No record is bound to this launch.</p>
          )}
        </div>

        {p && (
          <div>
            <h3 className="launch-sub">The pair</h3>
            <dl className="launch-dl">
              <div>
                <dt>Pair</dt>
                <dd>
                  {p.name} ({p.symbol}), from PancakeSwap V2's testnet factory
                </dd>
              </div>
              <div>
                <dt>Reserves</dt>
                <dd className="num">
                  {coin(p.reserveQuote, l.token.quoteSymbol)} and {tokens(p.reserveToken, l.token.symbol)}
                </dd>
              </div>
              <div>
                <dt>LP tokens</dt>
                <dd>
                  <span className="num">{formatAmount(p.lpTotal, 18, 2)}</span>
                  {burned === p.lpTotal ? (
                    <p className="launch-dl__note">
                      Held at <code>0x…dEaD</code> and the zero address (<span className="num">{formatInt(Number(p.lpAtZero))}</span> wei), so the liquidity cannot be withdrawn.
                    </p>
                  ) : (
                    <p className="launch-dl__note">
                      <span className="num">{formatAmount(burned, 18, 2)}</span> of them at <code>0x…dEaD</code> and the zero address.
                    </p>
                  )}
                </dd>
              </div>
            </dl>
          </div>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------- Check it

/** The card's: every replayed frame and setup transaction, and the launch's own addresses. */
function cardCheck(live: Live<LaunchRead>): CheckItProps {
  const items: CheckItem[] = [];
  for (const l of LAUNCHES) {
    for (const f of l.frames) {
      const what = { create: "Create", buy: "Buy", sell: "Sell", refused: "Graduate, refused", bind: "Bind the sealed record", graduated: "Graduate, granted" }[f.kind];
      items.push(tx(`${l.symbol}: ${what}`, f.hash, `Block ${formatInt(f.block)}, ${dualTime(f.time).ct}${f.ok ? "" : ", reverted: EvidenceMissing"}`));
    }
    for (const s of l.setup) items.push(tx(`${l.symbol}: ${s.label}`, s.hash, `Block ${formatInt(s.block)}`));
    items.push(addr(`${l.symbol}, the token`, l.token), addr(`${l.symbol}'s vault, the bonding curve`, l.vault), addr(`${l.symbol} / WBNB, the PancakeSwap V2 pair`, l.pair));
    if (l === LAUNCHES[0]) {
      items.push(addr("The creator's wallet", l.creator, "A disposable testnet wallet: it created each token, traded on the curve, bound the record and called graduate."));
      items.push(addr("The Wattness agent", l.agent, "GateRecord's committer for the sealed plans: the record a launch needs is this wallet's."));
    }
    const bound = l.frames.find((f) => f.bound)?.bound;
    if (bound) {
      items.push({ kind: "root", label: `The bound record's root, ${formatOperatingDay(odDay(bound.od))}`, value: bound.root, note: `${formatInt(bound.leafCount)} batteries` });
      items.push({ kind: "key", label: "The bound record's key in GateRecord", value: bound.key, note: `keyOf(agent, scope, ${bound.od})` });
    }
  }
  const checks = live.read?.data.replays ?? null;
  const bad = checks?.flatMap((c) => c.mismatches) ?? [];
  const n = checks?.reduce((a, c) => a + c.checked, 0) ?? 0;
  return {
    items,
    status: checks ? (bad.length ? "failed" : "verified") : live.error ? null : "checking",
    how: checks
      ? bad.length
        ? `Read again from BSC testnet in your browser: ${bad.join("; ")}.`
        : `Every transaction's receipt read again from BSC testnet in your browser, at block ${formatInt(Number(live.read!.at.number))}: all ${n} match, each frame's status, block, time and token moves and each setup transaction's status and block.`
      : "Each transaction opens on testnet.bscscan.com; the page reads every receipt again from BSC testnet once a public node answers.",
  };
}

function gateCheck(l: LaunchRead | undefined): CheckItProps {
  const g = l?.gate;
  return {
    items: [
      addr("The Wattness agent", g?.agent ?? OPENFOUR.launch.agent),
      ...(g?.codeHash ? [{ kind: "hash" as const, label: "The code hash the launch requires", value: g.codeHash, note: "The planner's git tree, left-aligned in 32 bytes." }] : []),
      addr("GateRecord", g?.gateRecord ?? OPENFOUR.gateRecord, "Fixed in the module's implementation, so a launch cannot point the gate at another record."),
      addr("PLNR's migrate", g?.module ?? OPENFOUR.launch.migrateModule),
      addr("PLNR's vault", l?.vault.address ?? OPENFOUR.launch.vault),
    ],
    status: l ? "verified" : null,
    how: l ? "Read live from BSC testnet with the conditions above." : undefined,
  };
}

function stepsCheck(l: LaunchRead | undefined): CheckItProps {
  const steps = l?.steps;
  const label: Record<StepId, string> = {
    module: "Deploy the migrate module",
    preset: "Add the preset",
    create: "Create PLNR",
    refused: "Graduate, refused",
    bind: "Bind the sealed record",
    graduated: "Graduate, granted",
  };
  const items: CheckItem[] = OPENFOUR.steps.map((s) => {
    const v = steps?.find((x) => x.id === s.id);
    return tx(label[s.id], s.hash, v ? `Block ${formatInt(Number(v.blockNumber))}, ${v.ok ? "succeeded" : "reverted"}` : undefined);
  });
  const made = steps?.find((s) => s.id === "module")?.created;
  items.push(addr("Migrate implementation", made ?? OPENFOUR.module.implementation), addr("Migrate beacon", OPENFOUR.module.beacon));
  const bound = steps?.find((s) => s.id === "bind")?.bound;
  if (bound) items.push({ kind: "root", label: `The bound root, ${formatOperatingDay(odDay(bound.od))}`, value: bound.root });
  return { items, status: l ? "verified" : null, how: l ? "Each status from its receipt, read live from BSC testnet." : undefined };
}

function todayCheck(l: LaunchRead | undefined): CheckItProps {
  const rows: CheckItem[] = [
    addr("Registry", OPENFOUR.registry, "Ours: it holds the module and the preset."),
    addr("Core", OPENFOUR.core),
    addr("Tools", OPENFOUR.tools),
    addr("Migrate implementation", OPENFOUR.module.implementation),
    addr("Migrate beacon", OPENFOUR.module.beacon),
    addr("PLNR", l?.token.address ?? OPENFOUR.launch.token),
    addr("PLNR's migrate", OPENFOUR.launch.migrateModule),
    addr("PLNR's vault", OPENFOUR.launch.vault),
    addr("PLNR / WBNB pair", l?.pool?.pair ?? OPENFOUR.launch.pair),
    addr("Pair factory", l?.pool?.factory ?? OPENFOUR.module.pairFactory, "PancakeSwap V2, fixed in the module's implementation."),
    addr("GateRecord", OPENFOUR.gateRecord, "Fixed in the module's implementation, so a launch cannot point the gate at another record."),
  ];
  const e = l?.gate.evidence;
  if (l?.record) rows.push({ kind: "root", label: "The bound record's root", value: l.record.root });
  if (e) rows.push(addr("The record's binder", e.boundBy, `The token's ${e.boundBy.toLowerCase() === l!.token.creator.toLowerCase() ? "creator" : "agent"}`));
  return {
    items: rows,
    status: l ? "verified" : null,
    how: (
      <>
        Addresses from{" "}
        <a href={`${REPO_URL}/blob/main/modules/openfour/deployments/bsc-testnet.json`} target="_blank" rel="noreferrer">
          modules/openfour/deployments/bsc-testnet.json
        </a>
        ; each opens on testnet.bscscan.com.{l ? " The token, the pair, its factory and the record are read live from BSC testnet." : ""}
      </>
    ),
  };
}

/**
 * A live section before its first read: the shared loading bar; if no node answers, one muted line on the page (in
 * its first live section) with the stamp's compact Read again, and nothing in the others, as Verify does.
 */
function Pending({ live, first = false }: { live: Live<LaunchRead>; first?: boolean }) {
  if (!live.error) return <Loading label="Reading BSC testnet" />;
  if (!first) return null;
  return (
    <p className="launch-pending">
      No public BSC testnet node answered just now, so the live figures are not shown.
      <button type="button" className="live-read__again" onClick={live.refresh} disabled={live.busy}>
        <Glyph name="refresh" />
        {live.busy ? "Reading" : "Read again"}
      </button>
    </p>
  );
}

function Stamp({ live, first = false }: { live: Live<LaunchRead>; first?: boolean }) {
  if (!live.read) return null;
  // one Read again on the page, on its first live section's stamp
  return <LiveRead at={live.read.at} rpc={live.read.rpc} busy={live.busy} error={first ? live.error : null} onRefresh={first ? live.refresh : undefined} />;
}

export default function LaunchpadPage() {
  const live = useTestnet("launchpad", readLaunch);
  const l = live.read?.data;
  const registry = useLogoRegistry();
  const card = cardCheck(live);
  return (
    <div className="page page--launchpad">
      <PageHeader
        title="Launchpad"
        lede="Agent tokens on our own OpenFour deployment on BSC testnet, replayed from their transactions: each graduated into a PancakeSwap V2 pair only once the Wattness agent's sealed record for its day was bound to it."
      />

      <Section id="launch-card" variant="flush" check={card} source={registry ? `Data: BSC testnet receipts, chain 97. ${registry.note}` : "Data: BSC testnet receipts, chain 97."}>
        {/* The token's picture: a rendered still of its agent can stand in the card's art slot. */}
        <LaunchCard
          launches={LAUNCHES}
          chip={registry?.logos.openfour ?? null}
          check={
            card.status === "verified" ? (
              <span className="launch-verified">
                <Glyph name="check" />
                Every transaction checked on BSC testnet
              </span>
            ) : null
          }
        />
      </Section>

      <LaunchObject />

      <Section
        id="launch-gate"
        title="The Custom Migrate Step"
        lede="Our module replaces Migrate in OpenFour's Bonding V1 preset. A launch graduates only when both conditions hold as the migration runs; the module rechecks both against the vault and GateRecord."
        builtWith={sponsors(registry, "openfour")}
        check={gateCheck(l)}
        source={SOURCE}
      >
        {l ? (
          <div className="launch-stack">
            <Stamp live={live} first />
            <Conditions l={l} />
          </div>
        ) : (
          <Pending live={live} first />
        )}
      </Section>

      <Section id="launch-steps" title="PLNR's Graduation, Step by Step" lede="Every transaction of the first launch, from the module's deployment on, in order, with its status from its receipt." check={stepsCheck(l)} source={SOURCE}>
        {l ? (
          <div className="launch-stack">
            <Stamp live={live} />
            <Steps l={l} />
          </div>
        ) : (
          <Pending live={live} />
        )}
      </Section>

      <Section id="launch-today" title="PLNR Today" lede="The token, the record bound to it and the pair it graduated into, as the chain holds them now." check={todayCheck(l)} source={SOURCE}>
        {l ? (
          <div className="launch-stack">
            <Stamp live={live} />
            <Today l={l} />
          </div>
        ) : (
          <Pending live={live} />
        )}
      </Section>
    </div>
  );
}
