// The Wattness mark: a signal trace (flat, a dip, a tall spike, a dip, flat)
// into a node. Geometry copied exactly from wattness.tech's ui/logo.tsx, which
// copied it from wattness.ai, so the mark here is the mark, not a likeness.
//
// The second copy of the path is the hover draw-on: dashed at pathLength 100
// and swept left to right, the way the trace is read, ending on the node
// (.brand-trace in shell.css). Always drawn in ink, never teal or yellow.
export const MARK_PATH = "M0 28.2 H13.95 L20.45 53.65 L32.5 5.2 L44.45 53.65 L50.7 28.2 H59.35";
export const MARK_NODE = { cx: 61.5, cy: 28.2, r: 2.85 };

/** Stroke 4 for the header sizes (16 to 32 px); 2.5 for 48 px and up. */
export function Logo({ className, stroke = 4, trace = true }: { className?: string; stroke?: number; trace?: boolean }) {
  const line = {
    stroke: "currentColor",
    strokeWidth: stroke,
    strokeLinecap: "butt" as const,
    strokeLinejoin: "miter" as const,
    strokeMiterlimit: 12,
  };
  return (
    <svg className={className} viewBox="-1.4 -1.4 67 61.6" fill="none" aria-hidden="true" focusable="false">
      <path d={MARK_PATH} {...line} />
      <circle cx={MARK_NODE.cx} cy={MARK_NODE.cy} r={MARK_NODE.r} fill="currentColor" />
      {trace && (
        <>
          <path className="brand-trace" d={MARK_PATH} pathLength={100} {...line} />
          <circle className="brand-trace-node" cx={MARK_NODE.cx} cy={MARK_NODE.cy} r={MARK_NODE.r} fill="currentColor" />
        </>
      )}
    </svg>
  );
}
