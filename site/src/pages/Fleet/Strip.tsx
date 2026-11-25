// A battery's day at a glance: its chosen plan's 24 hourly MW, discharge above
// the line and charge below it, in the one hue the site gives a plan's MW (the
// sign is the position). Scaled to the battery's own rating, so every row reads
// the same way whatever its size. A glyph in a table row: the open row and the
// Battery tab carry the readable chart.

interface StripProps {
  scheduleMw: readonly number[];
  powerMw: number;
  width?: number;
  height?: number;
}

export function Strip({ scheduleMw, powerMw, width = 96, height = 20 }: StripProps) {
  const n = scheduleMw.length || 24;
  const gap = 1;
  const bw = (width - gap * (n - 1)) / n;
  const mid = height / 2;
  const scale = powerMw > 0 ? (mid - 1) / powerMw : 0;
  return (
    <svg className="fl-strip" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" focusable="false">
      <line x1={0} x2={width} y1={mid} y2={mid} className="fl-strip__axis" />
      {scheduleMw.map((mw, h) => {
        if (mw === 0) return null;
        const len = Math.max(1, Math.abs(mw) * scale);
        return <rect key={h} x={h * (bw + gap)} y={mw > 0 ? mid - len : mid} width={bw} height={len} className="fl-strip__bar" />;
      })}
    </svg>
  );
}
