import { useId } from "react";

// Ness's mark, drawn for this site after the Wattness Terminal's: a glass orb
// with a weighted body of teal, blue and gold inside it, the shape wattness.ai
// gives an agent in its walkthrough. The body drifts slowly; it rests under
// reduced motion and in a recording (launcher.css).

export function NessMark({ size = 20 }: { size?: number }) {
  // Each mark keeps its own gradient ids: a page can show two (the launcher and the panel).
  const id = `nm${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <svg className="ness-mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id={`${id}-halo`} cx="50%" cy="50%" r="50%">
          <stop offset="0.62" stopColor="#6fe0bb" stopOpacity="0" />
          <stop offset="0.86" stopColor="#6fe0bb" stopOpacity="0.32" />
          <stop offset="1" stopColor="#6fe0bb" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-body`} x1="0.2" y1="0.06" x2="0.78" y2="0.96">
          <stop offset="0" stopColor="#36cfae" />
          <stop offset="0.44" stopColor="#2e7ee3" />
          <stop offset="0.76" stopColor="#57c5d7" />
          <stop offset="1" stopColor="#f2cf46" />
        </linearGradient>
        <radialGradient id={`${id}-glass`} cx="37%" cy="29%" r="73%">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.94" />
          <stop offset="0.54" stopColor="#c2f0de" stopOpacity="0.4" />
          <stop offset="1" stopColor="#7bd8bb" stopOpacity="0.18" />
        </radialGradient>
        <radialGradient id={`${id}-shine`} cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.9" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <clipPath id={`${id}-clip`}>
          <circle cx="16" cy="16" r="11.4" />
        </clipPath>
      </defs>
      <circle cx="16" cy="16" r="15.6" fill={`url(#${id}-halo)`} />
      <g clipPath={`url(#${id}-clip)`}>
        {/* heavier below, as if the body inside has weight */}
        <path className="ness-mark__body" d="M16 6.7c4.3 0 7.8 3.3 7.8 7.6 0 4.9-3.4 8.7-7.8 8.7s-7.9-3.6-7.9-8.3c0-4.5 3.6-8 7.9-8Z" fill={`url(#${id}-body)`} />
      </g>
      <circle cx="16" cy="16" r="11.4" fill={`url(#${id}-glass)`} />
      <circle cx="16" cy="16" r="11.4" fill="none" stroke="#8fe3c6" strokeOpacity="0.6" strokeWidth="0.9" />
      <ellipse cx="12.2" cy="11.3" rx="3.1" ry="2.2" fill={`url(#${id}-shine)`} />
    </svg>
  );
}
