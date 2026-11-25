// A battery's day at a glance: 24 hourly bars, discharge above the line in
// teal, charge below it. Scaled to the battery's own rating, so every row
// reads the same way whatever its size.

interface StripProps {
  scheduleMw: readonly number[];
  powerMw: number;
  width?: number;
  height?: number;
  className?: string;
}

export function Strip({ scheduleMw, powerMw, width = 96, height = 22, className }: StripProps) {
  const n = scheduleMw.length || 24;
  const gap = 1;
  const bw = (width - gap * (n - 1)) / n;
  const mid = height / 2;
  const scale = powerMw > 0 ? (mid - 1) / powerMw : 0;
  return (
    <svg className={`sd-strip${className ? ` ${className}` : ""}`} width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" focusable="false">
      <line x1={0} x2={width} y1={mid} y2={mid} className="sd-strip__axis" />
      {scheduleMw.map((mw, h) => {
        if (mw === 0) return null;
        const len = Math.max(1, Math.abs(mw) * scale);
        const x = h * (bw + gap);
        return <rect key={h} x={x} y={mw > 0 ? mid - len : mid} width={bw} height={len} className={mw > 0 ? "sd-strip__dis" : "sd-strip__chg"} />;
      })}
    </svg>
  );
}
