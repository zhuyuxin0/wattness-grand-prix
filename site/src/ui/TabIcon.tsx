import { TAB_ICONS, TAB_ICON_STROKE, type TabIconDrawing, type TabIconName } from "./tab-icons";
import "./tab-icon.css";

// A tab's icon (tab-icons.ts): a line drawing in the text's color, beside the tab's label and never instead of it, so
// it is always aria-hidden. The stroke is set in the drawing's own units so that it measures 1.3 px at 16 px in every
// box.

export function TabIcon({ name, size = 16, className }: { name: TabIconName; size?: number; className?: string }) {
  const icon: TabIconDrawing = TAB_ICONS[name];
  return (
    <svg
      className={`tab-icon${className ? ` ${className}` : ""}`}
      viewBox={`0 0 ${icon.box} ${icon.box}`}
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={(TAB_ICON_STROKE * icon.box) / 16}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      data-icon={name}
    >
      {icon.d.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
