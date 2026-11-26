import { applyWeatherRule, equalSharePpm, stressBucket, WEATHER_RULE_ID, WEATHER_RULE_V1 } from "@core/weather";
import type { DeskCommon } from "../../data/plan";
import { dualTime, gateFor } from "../../lib/time";
import { Section } from "../../ui";
import { count, Fact, Facts, shortDay, type HubsDoc } from "../Battery/kit";

// The Cournot card: the risk officer's weather rule, gate-record.weather-stress.v1
// (packages/core/src/weather.ts), run here with the rule's own code on the
// reading the Cournot adapter records, and on this battery's hub scenarios.

/**
 * Cournot's recorded 25 Nov reading of Kalshi's Dallas-Fort Worth market for
 * Nov 26, as packages/adapters/cournot pins it (test/reading.test.ts and its
 * README): market, station, threshold, date, the probability in ppm, and the
 * receipt time rounded up to the second, 496 s before the Nov 26 gate.
 */
const READING = {
  marketId: "24962617",
  station: "CLIDFW",
  place: "Dallas–Fort Worth",
  thresholdF: 29,
  date: "2026-11-26",
  probabilityPpm: 10_000,
  observedUnix: gateFor("2026-11-26") - 496,
  basisSource: "Kalshi's YES quote",
  basisUnix: Math.floor(Date.parse("2026-11-25T15:50:29Z") / 1000),
} as const;

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

export function CournotCard({
  common,
  hubName,
  hub,
  historyDays,
  basisCount,
  sealedUnix,
}: {
  common: DeskCommon;
  hubName: string;
  hub: Hub | undefined;
  historyDays: string[];
  basisCount: number;
  /** When the day's record was committed, for the reading's place in time. */
  sealedUnix: number | null;
}) {
  const rule = WEATHER_RULE_V1;
  const size = common.instrument.size_kwh;
  const planCap = common.assumptions.max_contracts_per_hour;
  const out = applyWeatherRule(READING.probabilityPpm, size, planCap, rule);
  const bucket = bucketAt(hub, historyDays, basisCount);
  const read = dualTime(READING.observedUnix);
  const basis = dualTime(READING.basisUnix, { date: false });
  const gate = gateFor(READING.date);
  const before = gate - READING.observedUnix;
  const sealed = sealedUnix != null ? dualTime(sealedUnix, { date: false }) : null;
  const p = READING.probabilityPpm / 1e6;

  return (
    <Section
      id="fc-cournot"
      title="Weather Odds from Cournot"
      lede={`Before the gate the planner may read one probability from Cournot: the odds, on Kalshi's market, that a ${READING.place} dawn turns cold. The risk officer's rule, ${WEATHER_RULE_ID}, turns that one number into two plan settings, in exact integers.`}
      source={
        <>
          Data: Cournot, Kalshi market {READING.marketId}, as packages/adapters/cournot records the reading. Rule: packages/core/src/weather.ts, run here with the same code; this
          battery's stress days from its hub scenarios above. Calculation and display: Wattness.
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
              <dd className="num">min(the plan's cap, floor(L / {mwh(size)})) contracts an hour</dd>
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

        <div className="fc-cn__reading">
          <h3 className="fc-cn__h">The recorded reading, Nov 25</h3>
          <Facts className="fc-cn__facts">
            <Fact label="Market" note={`Kalshi: will the minimum temperature at ${READING.place} (station ${READING.station}) be below ${READING.thresholdF}°F on ${shortDay(READING.date)}?`}>
              <span className="num">{READING.marketId}</span>
            </Fact>
            <Fact label="Cournot's probability, p" note={`${count(READING.probabilityPpm)} ppm, from ${READING.basisSource} at ${basis.ct}${basis.yours ? ` (${basis.yours})` : ""}`}>
              <span className="num">{p.toFixed(2)}</span>
            </Fact>
            <Fact label="Received" note={`${Math.floor(before / 60)} min ${before % 60} s before the ${shortDay(READING.date)} gate${read.yours ? `; ${read.yours}` : ""}`}>
              <span className="num">{read.ct}</span>
            </Fact>
            <Fact label="Stress weight, w" note={`${count(out.stress_weight_ppm)} ppm`}>
              <span className="num">{share(out.stress_weight_ppm)}</span>
            </Fact>
            <Fact label="Hedge limit, L" note={`${count(out.hedge_limit_kwh)} kWh, floored to the kWh`}>
              <span className="num">{mwh(out.hedge_limit_kwh)}</span>
            </Fact>
            <Fact label="Contract cap" note={`the lower of the plan's own ${planCap} and ${Math.floor(out.hedge_limit_kwh / size)} contracts of ${mwh(size)}`}>
              <span className="num">{out.max_contracts_per_hour} contracts an hour</span>
            </Fact>
            {bucket && (
              <Fact
                label={`Stress bucket at ${hubName}`}
                wide
                note={`Equal weights would give these ${count(bucket.scenarios)} scenarios ${ppm(equalSharePpm(bucket))} of the weight; the rule gives them w, ${ppm(out.stress_weight_ppm)}.`}
              >
                <span className="num">
                  {bucket.days.length} of {historyDays.length} history days, {count(bucket.scenarios)} of {count(bucket.flags.length)} scenarios
                </span>
                <span className="fc-cn__days">{bucket.days.map(shortDay).join(", ")}</span>
              </Fact>
            )}
          </Facts>
          <p className="fc-cn__note">
            {sealed ? `The ${shortDay(READING.date)} record was sealed at ${sealed.ct}${sealed.yours ? ` (${sealed.yours})` : ""}, before this reading arrived, so its plans keep equal weights. ` : ""}A plan that reads Cournot
            before its seal writes the reading, the rule and the weights into its leaf, and the verifier (packages/verifier) recomputes all of it: V7 hashes the published response
            against the leaf, V8 recomputes the rule and the stress bucket, and V5 recomputes each arm's mean and CVaR under the weights.
          </p>
        </div>
      </div>
    </Section>
  );
}

/** The scenarios' weighting in words: "equally weighted", or "stress-weighted" for the weather rule's. */
export function weightingWords(weighting: string | undefined): string {
  if (!weighting || weighting === "equal") return "equally weighted";
  if (weighting.startsWith("stress-weighted")) return "stress-weighted";
  return weighting.replace(/\s*weights?$/, "");
}
