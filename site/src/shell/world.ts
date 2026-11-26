import { batteryPath, selectedBattery } from "./battery";
import { worldTab } from "./tabs";

/**
 * Where a tab the 3D world names opens (the story's and the stack's onRoute):
 * the tab's path, or for a battery tab the path for the given battery, by
 * default the one the visitor carries, as the side panel opens it. Undefined
 * for an id the site does not know, which a page ignores.
 *
 *   onRoute: (id) => { const to = worldPath(id); if (to) navigate(to); }
 */
export function worldPath(id: string, battery: string = selectedBattery()): string | undefined {
  const tab = worldTab(id);
  if (!tab) return undefined;
  return tab.battery ? batteryPath(tab.path, battery) : tab.path;
}
