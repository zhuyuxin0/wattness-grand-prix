import { useSyncExternalStore } from "react";
import { palette, stageColor, type Theme } from "../design/tokens";
import { onThemeChange, themeInUse } from "../lib/theme";

/** The theme in use, re-rendering when it changes. */
export function useTheme(): Theme {
  return useSyncExternalStore(onThemeChange, themeInUse, () => "light" as const);
}

/**
 * The colors a canvas or WebGL scene draws with. "dark" holds the stage dark in
 * either theme, the way wattness.tech's intro does (wrap its DOM in
 * data-atmosphere="dark" so labels match); "follow" takes the theme in use.
 */
export function useSceneTheme(hold: "dark" | "follow" = "dark") {
  const inUse = useTheme();
  const theme: Theme = hold === "dark" ? "dark" : inUse;
  return { theme, palette: palette[theme], stage: hold === "dark" ? stageColor : null } as const;
}
