import { applyWeatherRule, equalSharePpm, stressBucket, WEATHER_RULE_ID, WEATHER_RULE_V1 } from "@core/weather";
import { useLoad } from "../../data";
import { dataUrl } from "../../data/load";
import type { CournotReading, Desk, DeskCommon } from "../../data/plan";
import { minSec } from "../../lib/clock";
import { dualTime } from "../../lib/time";
import { Glyph, Hash, Section } from "../../ui";
import { count, Fact, Facts, shortDay, type HubsDoc } from "../Battery/kit";

// The Cournot card: the risk officer's weather rule, gate-record.weather-stress.v1
// (packages/core/src/weather.ts), and the reading the day's plans sealed: the
// probability, its Kalshi quote and when it arrived, as every leaf records it
// (outside_inputs.cournot), and the response the leaves commit, saved beside
// the record (cournot/probability.json) and hashed here. The rule's own code
// runs here on that reading and on this battery's hub scenarios, beside the
// settings its sealed leaf records.

/** Kalshi settlement stations the rule reads, by plain name. */
const PLACES: Record<string, string> = { CLIDFW: "Dallas–Fort Worth" };

const ppm = (x: number, dp = 2) => `${((x / 1e6) * 100).toFixed(dp)}%`;
const share = (x: number) => (x / 1e6).toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
/** A conditional as the rule states it, to two places: 0.80, 0.25. */
const two = (x: number) => (x / 1e6).toFixed(2);
const mwh = (kwh: number) => `${(kwh / 1000).toLocaleString("en-US", { maximumFractionDigits: 3 })} MWh`;
const peaks = (hours: readonly number[]) => {
  // Hour indexes run from 0 (hour ending 1); group runs of consecutive hours as "hour ending 7 to 10".
  const runs: [number, number][] = [];
  for (const h of hours) {
    const last = runs[runs.length - 1];
    if (last && h === last[1] + 1) last[1] = h;
    else runs.push([h, h]);
  }
  return runs.map(([a, b]) => `${a + 1} to ${b + 1}`).join(" and ");
};

/** The Kalshi ticker a basis link names (op_market_ticker=...), or null. */
function tickerOf(url: string | undefined): string | null {
  const m = /[?&]op_market_ticker=([A-Z0-9-]+)/.exec(url ?? "");
  return m ? m[1]! : null;
}

/** SHA-256 of a published file's bytes, as hex. */
async function fileSha256(route: string): Promise<string> {
  const res = await fetch(dataUrl(route));
  if (!res.ok) throw new Error(`${route}: HTTP ${res.status}`);
  const d = await crypto.subtle.digest("SHA-256", await res.arrayBuffer());
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

type Hub = HubsDoc["hubs"][string];

function bucketAt(hub: Hub | undefined, historyDays: string[], basisCount: number) {
  if (!hub || hub.paths.length !== historyDays.length) return null;
  // The published paths are each history day's hub settlement over four, in cents: times four is the matrix's hub_sum4.
  const rows = hub.paths.flatMap((p) => Array.from({ length: basisCount }, () => p.map((v) => Math.round(v * 4))));
  try {
    return stressBucket(historyDays, basisCount, rows);
  } catch {
    return null;
  }
}

function Check({ ok, yes, no }: { ok: boolean; yes: string; no: string }) {
  return (
    <span className={`fc-cn__check${ok ? "" : " fc-cn__check--no"}`}>
      <Glyph name={ok ? "check" : "close"} />
      {ok ? yes : no}
    </span>
  );
}

export function CournotCard({
  common,
  desk,
  hubName,
  hub,
  historyDays,
  basisCount,
  sealedUnix,
}: {
  common: DeskCommon;
  desk: Desk;
  hubName: string;
  hub: Hub | undefined;
  historyDays: string[];
  basisCount: number;
  /** When the day's record was first committed, for the reading's place in time. */
  sealedUnix: number | null;
}) {
  const rule = WEATHER_RULE_V1;
  const reading = common.cournot ?? null;
  const claim = reading?.claim ?? null;
  const place = (claim && PLACES[claim.station]) ?? "Dallas–Fort Worth";
  const ticker = tickerOf(reading?.basis[0]?.url);
  const day = shortDay(common.operatingDay);

  return (
    <Section
      id="fc-cournot"
      title="Weather Odds from Cournot"
      lede={`Before the gate the planner may read one probability from Cournot: the odds, on Kalshi's market, that a ${place} dawn turns cold. The risk officer's rule, ${WEATHER_RULE_ID}, turns that one number into two plan settings, in exact integers.`}
      source={
        <>
          Data: Cournot{claim ? ` (market ${claim.market_id})` : ""}, from Kalshi{ticker ? ` (${ticker})` : ""}, as the {day} plans record the reading
          {reading?.response ? `, and its saved response (${reading.response.route})` : ""}. Rule: packages/core/src/weather.ts, run here with the same code; this battery's
          stress days from its hub scenarios above. Calculation and display: Wattness.
        </>
      }
    >
      <div className="fc-cn">
        <div className="fc-cn__rule">
          <h3 className="fc-cn__h">The rule</h3>
          <dl className="fc-cn__eqs">
            <div>
              <dt>Stress weight</dt>
              <dd className="num">
                w = p × {two(rule.stress_if_event_ppm)} + (1 − p) × {two(rule.stress_if_no_event_ppm)}
              </dd>
            </div>
            <div>
              <dt>Hedge limit</dt>
              <dd className="num">
                L = {mwh(rule.base_hedge_limit_kwh)} × (1 − {share(rule.hedge_cut_ppm)} × w)
              </dd>
            </div>
            <div>
              <dt>Contract cap</dt>
              <dd className="num">min(the plan's cap, floor(L / {mwh(common.instrument.size_kwh)})) contracts an hour</dd>
            </div>
            <div>
              <dt>Stress bucket</dt>
              <dd>
                The top {rule.stress_share[0] === 1 && rule.stress_share[1] === 4 ? "quarter of" : `${rule.stress_share[0]} in ${rule.stress_share[1]}`} history days, rounded up, by
                their hub settlements summed over ERCOT's winter peaks (hour ending{" "}
                {peaks(rule.stress_hours)}, CT). Their scenarios share w; the others share 1 − w.
              </dd>
            </div>
          </dl>
          <p className="fc-cn__note">
            The {two(rule.stress_if_event_ppm)} and {two(rule.stress_if_no_event_ppm)} conditionals, the {mwh(rule.base_hedge_limit_kwh)} base and the{" "}
            {ppm(rule.hedge_cut_ppm, 0)} cut are the rule's declared assumptions. A probability for a cold dawn is not a probability of a price spike; the rule states the link.
          </p>
        </div>

        {reading && claim && reading.probabilityPpm != null ? (
          <SealedReading
            common={common}
            desk={desk}
            reading={reading}
            claim={claim}
            place={place}
            ticker={ticker}
            hubName={hubName}
            bucket={bucketAt(hub, historyDays, basisCount)}
            historyDays={historyDays}
            sealedUnix={sealedUnix}
          />
        ) : (
          <div className="fc-cn__reading">
            <h3 className="fc-cn__h">No reading for {day}</h3>
            <p className="fc-cn__note">No plan for {day} read Cournot before its seal, so its scenarios keep equal weights.</p>
          </div>
        )}
      </div>
    </Section>
  );
}

function SealedReading({
  common,
  desk,
  reading,
  claim,
  place,
  ticker,
  hubName,
  bucket,
  historyDays,
  sealedUnix,
}: {
  common: DeskCommon;
  desk: Desk;
  reading: CournotReading;
  claim: NonNullable<CournotReading["claim"]>;
  place: string;
  ticker: string | null;
  hubName: string;
  bucket: ReturnType<typeof bucketAt>;
  historyDays: string[];
  sealedUnix: number | null;
}) {
  const rule = WEATHER_RULE_V1;
  const size = common.instrument.size_kwh;
  const own = desk.cournot ?? null;
  const p = reading.probabilityPpm as number;
  // The plan's own cap before the rule cut it, as the leaves record it.
  const planCap = reading.planCap ?? common.assumptions.max_contracts_per_hour;
  const out = applyWeatherRule(p, size, planCap, rule);
  const sealed = own?.status === "applied" ? reading.after : null;
  const sealedBucket = own?.status === "applied" ? (reading.buckets[desk.hub] ?? null) : null;
  const shown = sealed ?? out;
  const same = sealed
    ? sealed.stress_weight_ppm === out.stress_weight_ppm && sealed.hedge_limit_kwh === out.hedge_limit_kwh && sealed.max_contracts_per_hour === out.max_contracts_per_hour
    : null;
  const day = shortDay(common.operatingDay);
  const observed = reading.observed;
  const read = observed ? dualTime(observed.unix) : null;
  const quote = reading.basis[0];
  const quoteAt = quote ? dualTime(Math.floor(Date.parse(quote.time) / 1000), { date: false }) : null;
  const sealedAt = sealedUnix != null ? dualTime(sealedUnix, { date: false }) : null;
  const response = reading.response;
  const hash = useLoad(() => (response ? fileSha256(response.route) : Promise.resolve(null)), `cournot-sha256:${response?.route ?? ""}`);
  const bucketSame = bucket && sealedBucket ? bucket.days.join() === sealedBucket.days.join() && bucket.scenarios === sealedBucket.scenarios : null;
  const all = reading.appliedTo === common.batteries;

  return (
    <div className="fc-cn__reading">
      <h3 className="fc-cn__h">The reading sealed into the {day} plans</h3>
      <Facts className="fc-cn__facts">
        <Fact
          label="Market"
          note={`Kalshi's market${ticker ? ` (${ticker})` : ""}: will the minimum temperature at ${place} (${claim.station}) be below ${claim.threshold_f}°F on ${shortDay(claim.date)}?`}
        >
          <span className="num">Cournot {claim.market_id}</span>
        </Fact>
        <Fact label="Cournot's probability, p" note={`${count(p)} ppm${quote && quoteAt ? `, from Kalshi's YES quote at ${quoteAt.ct}${quoteAt.yours ? ` (${quoteAt.yours})` : ""}` : ""}`}>
          <span className="num">{(p / 1e6).toFixed(2)}</span>
        </Fact>
        {read && observed && (
          <Fact label="Received" note={`${minSec(common.gate.unix - observed.unix)} before the ${day} gate${read.yours ? `; ${read.yours}` : ""}`}>
            <span className="num">{read.ct}</span>
          </Fact>
        )}
        <Fact label="Stress weight, w" note={`${count(shown.stress_weight_ppm)} ppm`}>
          <span className="num">{share(shown.stress_weight_ppm)}</span>
        </Fact>
        <Fact label="Hedge limit, L" note={`${count(shown.hedge_limit_kwh)} kWh, floored to the kWh`}>
          <span className="num">{mwh(shown.hedge_limit_kwh)}</span>
        </Fact>
        <Fact label="Contract cap" note={`the lower of the plan's own ${planCap} and ${Math.floor(shown.hedge_limit_kwh / size)} contracts of ${mwh(size)}`}>
          <span className="num">{shown.max_contracts_per_hour} contracts an hour</span>
        </Fact>
        {bucket && (
          <Fact
            label={`Stress bucket at ${hubName}`}
            wide
            note={
              <>
                Equal weights would give these {count(bucket.scenarios)} scenarios {ppm(equalSharePpm(bucket))} of the weight; the rule gives them w, {ppm(shown.stress_weight_ppm)}.
                {bucketSame !== null && <Check ok={bucketSame} yes="the same days this battery's sealed leaf names" no="other days than this battery's sealed leaf names" />}
              </>
            }
          >
            <span className="num">
              {bucket.days.length} of {historyDays.length} history days, {count(bucket.scenarios)} of {count(bucket.flags.length)} scenarios
            </span>
            <span className="fc-cn__days">{bucket.days.map(shortDay).join(", ")}</span>
          </Fact>
        )}
        {response && (
          <Fact
            label="Saved response"
            wide
            note={
              hash.status === "ready" && hash.data ? (
                <Check ok={hash.data === response.sha256} yes="its SHA-256, computed here, is the one every plan commits" no="its SHA-256 differs from the one the plans commit" />
              ) : hash.status === "error" ? (
                "not hashed: the file did not load"
              ) : (
                "hashing"
              )
            }
          >
            <a className="fc-cn__file" href={dataUrl(response.route)} target="_blank" rel="noreferrer">
              <span className="mono">{response.route}</span>
              <Glyph name="popout" />
            </a>
            <Hash value={response.sha256} head={8} tail={6} label="response SHA-256" />
          </Fact>
        )}
      </Facts>
      <p className="fc-cn__note">
        {all ? `All ${count(reading.appliedTo)}` : `${count(reading.appliedTo)} of ${count(common.batteries)}`} plans for {day} read this before their seal and wrote the
        reading, the rule and its settings into their leaves
        {sealedAt && observed && sealedUnix != null
          ? `; the record was sealed at ${sealedAt.ct}${sealedAt.yours ? ` (${sealedAt.yours})` : ""}, ${minSec(sealedUnix - observed.unix)} after the reading arrived`
          : ""}
        .{" "}
        {own?.status === "not_applied" ? `For this battery the rule was not applied: ${own.reason}. ` : ""}
        {same === true ? "The rule's code, run here on the reading, gives this battery's sealed w, L and cap. " : ""}
        {same === false ? "The rule's code, run here on the reading, gives other settings than this battery's sealed ones. " : ""}
        The verifier (packages/verifier) recomputes all of it: V7 hashes the saved response against the leaf, V8 recomputes the rule and the stress bucket, and V5 recomputes
        each arm's mean and CVaR under the weights.
      </p>
    </div>
  );
}

export { weightingWords } from "../Battery/kit";
