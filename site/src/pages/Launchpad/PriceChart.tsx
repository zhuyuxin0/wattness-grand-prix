import { scaleLinear, scaleLog } from "d3-scale";
import { useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { formatAmount } from "../../lib/amounts";
import { CENTRAL_TZ } from "../../config";
import { formatInZone } from "../../lib/time";
import { candles, marketAt, percent, priceNumber, priceRange, tinyText, type Candle } from "./market";
import type { LaunchReplay } from "./replay";

// The curve's price as candles, drawn from the launch's real buys and sells up to the replay's frame: a buy moves the
// price up from where the last trade left it, a sale moves it down, the volume under them. The time axis spans the
// whole launch from its create to its graduation, so candles appear in place as the replay plays, and the price axis
// is logarithmic over the launch's whole range, so the first small trades stay visible beside the sale's last buy.
// The graduation's refusal, the bound record and the migration stand on the axis as they happen, and the pair's first
// price ends the line. Hovering a candle reads it out; nothing moves under the pointer.

const FRAMES = [
  { seconds: 5, label: "5s" },
  { seconds: 15, label: "15s" },
  { seconds: 60, label: "1m" },
] as const;

const M = { top: 22, right: 78, bottom: 24, left: 10 };
const VOL_H = 44;

const wbnb = (v: bigint) => {
  const text = formatAmount(v, 18, v !== 0n && v < 10n ** 16n ? 6 : 4);
  return text.includes(".") ? text.replace(/\.?0+$/, "") : text;
};

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w !== undefined) setWidth(Math.round(w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/** 1, 2 and 5 times each power of ten inside the range. */
function logTicks(lo: number, hi: number): number[] {
  const out: number[] = [];
  for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++) {
    for (const m of [1, 2, 5]) {
      const v = m * 10 ** e;
      if (v >= lo && v <= hi) out.push(v);
    }
  }
  return out;
}

interface Mark {
  time: number;
  label: string;
  tone: "bad" | "seal" | "up";
}

export function PriceChart({ l, index }: { l: LaunchReplay; index: number }) {
  const [frame, setFrame] = useState<(typeof FRAMES)[number]["seconds"]>(15);
  const [hover, setHover] = useState<number | null>(null);
  const [box, width] = useWidth();
  const height = width && width < 560 ? 250 : 320;

  // every candle of the launch fixes the volume's scale; those up to the replay's frame are drawn
  const all = useMemo(() => candles(l, l.frames.length - 1, frame), [l, frame]);
  const shown = useMemo(() => candles(l, index, frame), [l, index, frame]);

  const first = l.frames[0]!.time;
  const last = l.frames[l.frames.length - 1]!.time;
  const x0 = Math.floor(first / frame) * frame - frame;
  const x1 = (Math.floor(last / frame) + 2) * frame;
  const [lo, hi] = priceRange(l);
  const plotW = Math.max(0, width - M.left - M.right);
  const priceBottom = height - M.bottom - VOL_H - 8;
  const x = scaleLinear().domain([x0, x1]).range([M.left, M.left + plotW]);
  const y = scaleLog()
    .domain([lo / 1.35, hi * 1.35])
    .range([priceBottom, M.top]);
  const slot = x(x0 + frame) - x(x0);
  const bodyW = Math.max(3, Math.min(22, slot * 0.66));
  const maxVol = all.reduce((a, c) => (c.volume > a ? c.volume : a), 1n);
  const vol = (v: bigint) => (Number((v * 1000n) / maxVol) / 1000) * (VOL_H - 4);

  const m = marketAt(l, index);
  const nowPrice = priceNumber(m.price);
  const lastCandle = shown[shown.length - 1] ?? null;
  const picked = (hover !== null ? shown.find((c) => c.start === hover) : null) ?? lastCandle;

  const marks: Mark[] = [];
  l.frames.forEach((f, i) => {
    if (i > index) return;
    if (f.kind === "refused") marks.push({ time: f.time, label: "Refused", tone: "bad" });
    if (f.kind === "bind") marks.push({ time: f.time, label: "Bound", tone: "seal" });
    if (f.kind === "graduated") marks.push({ time: f.time, label: "Migrated", tone: "up" });
  });
  const graduated = l.frames.slice(0, index + 1).find((f) => f.graduated);
  const rowEnds: number[] = [];
  const placed = marks.map((k) => {
    const start = x(k.time) + 4;
    let row = rowEnds.findIndex((end) => start >= end + 6);
    if (row < 0) row = rowEnds.length;
    rowEnds[row] = start + k.label.length * 6;
    return { ...k, y: M.top - 8 + row * 12 };
  });

  const timeTicks: number[] = [];
  const step = frame * Math.max(1, Math.ceil((x1 - x0) / frame / (plotW < 420 ? 3 : 6)));
  for (let t = Math.ceil(x0 / step) * step; t <= x1; t += step) if (x(t) > M.left + 26 && x(t) < M.left + plotW - 20) timeTicks.push(t);

  const onMove = (e: PointerEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const t = x.invert(e.clientX - r.left + M.left);
    const start = Math.floor(t / frame) * frame;
    setHover(shown.some((c) => c.start === start) ? start : null);
  };

  const up = (c: Candle) => c.close >= c.open;
  const label = `${l.symbol}'s price on the bonding curve in WBNB per token, log scale, from ${tinyText(lo)} at its create; ${m.trades} ${m.trades === 1 ? "trade" : "trades"} so far, now ${tinyText(nowPrice)}.`;

  return (
    <div className="lc-chart">
      <div className="lc-chart__bar">
        <div className="lc-tf" role="group" aria-label="Candle length">
          {FRAMES.map((f) => (
            <button key={f.seconds} type="button" aria-pressed={frame === f.seconds} onClick={() => setFrame(f.seconds)}>
              {f.label}
            </button>
          ))}
        </div>
        <span className="lc-chart__unit">Price, WBNB per {l.symbol} · log scale</span>
      </div>
      <p className="lc-ohlc num" aria-live="off">
        {picked ? (
          <>
            <span className="lc-ohlc__time">{formatInZone(picked.start, CENTRAL_TZ, { date: false })} CT</span>
            <span>
              O <b className={up(picked) ? "is-up" : "is-down"}>{tinyText(picked.open)}</b>
            </span>
            <span>
              H <b className={up(picked) ? "is-up" : "is-down"}>{tinyText(picked.high)}</b>
            </span>
            <span>
              L <b className={up(picked) ? "is-up" : "is-down"}>{tinyText(picked.low)}</b>
            </span>
            <span>
              C <b className={up(picked) ? "is-up" : "is-down"}>{tinyText(picked.close)}</b>
            </span>
            <b className={up(picked) ? "is-up" : "is-down"}>{percent(picked.close / picked.open - 1)}</b>
            <span>
              Vol <b>{wbnb(picked.volume)} WBNB</b>
            </span>
          </>
        ) : (
          <span className="lc-ohlc__time">No trades yet: the curve opens at {tinyText(priceNumber(m.open))} WBNB</span>
        )}
      </p>
      <div className="lc-chart__plot" ref={box}>
        {width > 0 && (
          <svg width={width} height={height} role="img" aria-label={label}>
            {/* grid and price axis */}
            {logTicks(lo / 1.35, hi * 1.35).map((v) => (
              <g key={v}>
                <line className="lc-grid" x1={M.left} x2={M.left + plotW} y1={y(v)} y2={y(v)} />
                <text className="lc-axis" x={M.left + plotW + 8} y={y(v)} dy="0.32em">
                  {tinyText(v, 3)}
                </text>
              </g>
            ))}
            {timeTicks.map((t) => (
              <g key={t}>
                <line className="lc-grid" x1={x(t)} x2={x(t)} y1={M.top} y2={height - M.bottom} />
                <text className="lc-axis" x={x(t)} y={height - 8} textAnchor="middle">
                  {formatInZone(t, CENTRAL_TZ, { date: false, seconds: frame < 60 })}
                </text>
              </g>
            ))}
            <text className="lc-axis lc-axis--tz" x={M.left + plotW + 8} y={height - 8}>
              CT
            </text>
            <line className="lc-rule" x1={M.left} x2={M.left + plotW} y1={priceBottom + 8} y2={priceBottom + 8} />

            {/* the graduation's moments; a label that would run into the one before steps down a row */}
            {placed.map((k) => (
              <g key={k.label} className={`lc-ev lc-ev--${k.tone}`}>
                <line x1={x(k.time)} x2={x(k.time)} y1={k.y + 2} y2={height - M.bottom} />
                <text x={x(k.time) + 4} y={k.y}>
                  {k.label}
                </text>
              </g>
            ))}

            {/* candles and volume */}
            {shown.map((c) => {
              const cx = x(c.start) + slot / 2;
              const yo = y(c.open);
              const yc = y(c.close);
              const isUp = up(c);
              const isNow = c.trades.some((t) => t.frame === index);
              return (
                <g key={c.start} className={`lc-candle ${isUp ? "is-up" : "is-down"}${isNow ? " is-now" : ""}${hover === c.start ? " is-hover" : ""}`}>
                  <line x1={cx} x2={cx} y1={y(c.high)} y2={y(c.low)} />
                  <rect x={cx - bodyW / 2} y={Math.min(yo, yc)} width={bodyW} height={Math.max(1.5, Math.abs(yc - yo))} rx={1.5} />
                  <rect className="lc-vol" x={cx - bodyW / 2} y={height - M.bottom - vol(c.volume)} width={bodyW} height={Math.max(1, vol(c.volume))} rx={1} />
                </g>
              );
            })}

            {/* the pair's first price */}
            {graduated?.graduated && (
              <g className="lc-pair">
                <circle cx={x(graduated.time)} cy={y(priceNumber(marketAt(l, l.frames.indexOf(graduated)).price))} r={4} />
              </g>
            )}

            {/* the last price: the curve's opening price until the first trade */}
            <g className={`lc-last ${m.change >= 0 ? "is-up" : "is-down"}`}>
              <line x1={M.left} x2={M.left + plotW} y1={y(nowPrice)} y2={y(nowPrice)} />
              <rect x={M.left + plotW + 2} y={y(nowPrice) - 9} width={M.right - 4} height={18} rx={3} />
              <text x={M.left + plotW + 8} y={y(nowPrice)} dy="0.32em">
                {tinyText(nowPrice)}
              </text>
            </g>

            <rect className="lc-hit" x={M.left} y={M.top} width={plotW} height={height - M.top - M.bottom} onPointerMove={onMove} onPointerLeave={() => setHover(null)} />
          </svg>
        )}
      </div>
    </div>
  );
}
