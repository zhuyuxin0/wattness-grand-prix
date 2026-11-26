import type { ReactNode } from "react";
import { REPO_URL } from "../../config";
import { minSec } from "../../lib/clock";
import { formatInt } from "../../lib/format";
import { formatAmount, formatPrice, formatTokens, ratio } from "../../lib/amounts";
import { addressUrl, blockUrl, txUrl, useTestnet, type Live } from "../../lib/testnet";
import { dualTime, formatOperatingDay } from "../../lib/time";
import { Glyph, Hash, Loading, PageHeader, ParcFerme, Section, Stat, StatRow } from "../../ui";
import { LiveRead } from "../../ui/LiveRead";
import { OPENFOUR, type StepId } from "./addresses";
import { readLaunch, type LaunchRead, type StepView } from "./chain";
import "./styles.css";

// Launchpad: OpenFour's evidence-gated graduation (modules/openfour). The
// custom migrate step, the launch's transactions in order with the refused
// attempt and the granted one, and the token, its pair and reserves read live.

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

function When({ unix }: { unix: number }) {
  const t = dualTime(unix);
  return (
    <span className="launch-when">
      <span className="num">{t.ct}</span>
      {t.yours && <span className="muted num">{t.yours}</span>}
    </span>
  );
}

/** An address linked to the explorer; `inline` drops the copy button inside a sentence. */
function Addr({ value, label, inline = false }: { value: string; label: string; inline?: boolean }) {
  return <Hash value={value} href={addressUrl(value)} label={label} copy={!inline} />;
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
            <dd className="launch-agent">
              {isAgent(g.agent) && <span>The Wattness agent</span>}
              <Addr value={g.agent} label="agent address" />
            </dd>
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
            <dd>{g.codeHash ? <Hash value={g.codeHash} head={10} tail={4} label="code hash" /> : "Any"}</dd>
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
            Our evidence-gated Migrate, <code>{l.gate.tag}</code>
            {s.created && (
              <>
                , deployed at <Addr value={s.created} label="module implementation address" inline />
              </>
            )}
            . Each launch runs its own instance behind the beacon <Addr value={OPENFOUR.module.beacon} label="beacon address" inline />.
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
            {s.bound && (
              <>
                {" "}
                for {formatOperatingDay(odDay(s.bound.od))} with root <Hash value={s.bound.root} label="root" copy={false} />
              </>
            )}{" "}
            checked the Wattness agent's record in GateRecord
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
                <Hash value={s.hash} href={txUrl(s.hash)} label="transaction hash" />
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
            note="From the reserves. A token's price says nothing about an agent's plans."
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
                <Addr value={l.token.address} label="token address" />
                <p className="launch-dl__note">
                  {l.token.name}: <span className="num">{tokens(l.token.totalSupply, l.token.symbol)}</span> in supply, created in block{" "}
                  <a className="num" href={blockUrl(l.token.createBlock)} target="_blank" rel="noreferrer">
                    {formatInt(Number(l.token.createBlock))}
                  </a>{" "}
                  with preset <span className="num">{String(l.token.presetId)}</span>.
                </p>
              </dd>
            </div>
            <div>
              <dt>Its vault</dt>
              <dd>
                <Addr value={l.vault.address} label="vault address" />
              </dd>
            </div>
            <div>
              <dt>Its migrate</dt>
              <dd>
                <Addr value={l.gate.module} label="migrate module address" />
                <p className="launch-dl__note">
                  <code>{l.gate.tag}</code> version {l.gate.version}, reading GateRecord at <Addr value={l.gate.gateRecord} label="GateRecord address" inline />
                </p>
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
                <dt>Root</dt>
                <dd>
                  <Hash value={r.root} label="root" />
                </dd>
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
                  <p className="launch-dl__note">
                    By <Addr value={e.boundBy} label="binder address" inline />, the token's {e.boundBy.toLowerCase() === l.token.creator.toLowerCase() ? "creator" : "agent"}
                  </p>
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
                  <Addr value={p.pair} label="pair address" />
                  <p className="launch-dl__note">
                    {p.name} ({p.symbol}), from the factory <Addr value={p.factory} label="factory address" inline />
                  </p>
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

function Contracts() {
  const rows: { label: string; value: string; note?: string }[] = [
    { label: "Registry", value: OPENFOUR.registry, note: "Ours: it holds the module and the preset." },
    { label: "Core", value: OPENFOUR.core },
    { label: "Tools", value: OPENFOUR.tools },
    { label: "Migrate implementation", value: OPENFOUR.module.implementation },
    { label: "Migrate beacon", value: OPENFOUR.module.beacon },
    { label: "PLNR", value: OPENFOUR.launch.token },
    { label: "PLNR's migrate", value: OPENFOUR.launch.migrateModule },
    { label: "PLNR's vault", value: OPENFOUR.launch.vault },
    { label: "PLNR / WBNB pair", value: OPENFOUR.launch.pair },
    { label: "Pair factory", value: OPENFOUR.module.pairFactory, note: "PancakeSwap V2, fixed in the module's implementation." },
    { label: "GateRecord", value: OPENFOUR.gateRecord, note: "Fixed in the module's implementation, so a launch cannot point the gate at another record." },
  ];
  return (
    <dl className="launch-dl launch-dl--contracts">
      {rows.map((r) => (
        <div key={r.label}>
          <dt>{r.label}</dt>
          <dd>
            <Addr value={r.value} label={`${r.label} address`} />
            {r.note && <p className="launch-dl__note">{r.note}</p>}
          </dd>
        </div>
      ))}
    </dl>
  );
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
  return (
    <div className="page page--launchpad">
      <PageHeader
        title="Launchpad"
        lede="Grand Prix Planner (PLNR), an agent token on our own OpenFour deployment on BSC testnet. It could graduate into a PancakeSwap V2 pair only with the Wattness agent's sealed record bound to it: the first attempt was refused, the second granted."
      />

      <Section
        id="launch-gate"
        title="The Custom Migrate Step"
        lede="Our module replaces Migrate in OpenFour's Bonding V1 preset. A launch graduates only when both conditions hold as the migration runs; the module rechecks both against the vault and GateRecord."
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

      <Section id="launch-steps" title="Graduation, Step by Step" lede="Every transaction of the launch, in order, with its status from its receipt." source={SOURCE}>
        {l ? (
          <div className="launch-stack">
            <Stamp live={live} />
            <Steps l={l} />
          </div>
        ) : (
          <Pending live={live} />
        )}
      </Section>

      <Section id="launch-today" title="PLNR Today" lede="The token, the record bound to it and the pair it graduated into, as the chain holds them now." source={SOURCE}>
        {l ? (
          <div className="launch-stack">
            <Stamp live={live} />
            <Today l={l} />
          </div>
        ) : (
          <Pending live={live} />
        )}
      </Section>

      <Section
        id="launch-contracts"
        title="Contracts"
        source={
          <>
            From{" "}
            <a href={`${REPO_URL}/blob/main/modules/openfour/deployments/bsc-testnet.json`} target="_blank" rel="noreferrer">
              modules/openfour/deployments/bsc-testnet.json
            </a>
            . Every address opens on testnet.bscscan.com.
          </>
        }
      >
        <Contracts />
      </Section>
    </div>
  );
}
