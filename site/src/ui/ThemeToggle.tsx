import { useSyncExternalStore } from "react";
import { onThemeChange, setTheme, themeInUse } from "../lib/theme";
import { Glyph } from "./Glyph";

/**
 * wattness.tech's theme control (apps/mms/src/ui/theme-switch.tsx): one button,
 * the moon in light and the sun in dark, that flips the theme in use. Picking
 * one remembers it; until then the system's stands.
 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const theme = useSyncExternalStore(onThemeChange, themeInUse, () => "light" as const);
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      className={`btn theme-toggle${className ? ` ${className}` : ""}`}
      aria-label={`Switch to the ${next} theme`}
      title={`Switch to the ${next} theme`}
      onClick={() => setTheme(next)}
    >
      <Glyph name={theme === "dark" ? "sun" : "moon"} size={12} />
    </button>
  );
}
