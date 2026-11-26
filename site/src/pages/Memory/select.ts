import type { BrainFocus } from "@world/stations/brain/mount";

// The Memory tab's one selection, held in its URL:
//   #/agents/memory?brain=<all|grand-prix|terminal|battery-review>&page=<slug>
// The 3D stage (BrainStage.tsx) and the page view under it (Build.tsx) read and
// write the same two params, so a page pinned on the stage is the page shown
// below it, and a page picked below is the one the stage pins. A page always
// comes with its brain: slugs repeat across brains. A link written before the
// stage, ?page=<brain>:<slug>, still opens its page.

export const BRAIN_FOCUS: readonly BrainFocus[] = ["all", "grand-prix", "terminal", "battery-review"];

const isFocus = (v: string | null): v is BrainFocus => v != null && (BRAIN_FOCUS as readonly string[]).includes(v);

export interface Selection {
  brain: BrainFocus;
  page: string | null;
}

export function readSelection(params: URLSearchParams): Selection {
  const b = params.get("brain");
  let brain: BrainFocus = isFocus(b) ? b : "all";
  let page = params.get("page") || null;
  // the earlier form, page=<brain>:<slug>
  const at = page ? page.indexOf(":") : -1;
  if (page && at > 0) {
    const lead = page.slice(0, at);
    if (isFocus(lead) && lead !== "all") {
      brain = lead;
      page = page.slice(at + 1) || null;
    }
  }
  return { brain, page };
}

/** The params with this selection; the other params (the tab a visitor came from) kept. */
export function writeSelection(params: URLSearchParams, s: Selection): URLSearchParams {
  const next = new URLSearchParams(params);
  if (s.brain === "all" && !s.page) next.delete("brain");
  else next.set("brain", s.brain);
  if (s.page) next.set("page", s.page);
  else next.delete("page");
  return next;
}

/** The page a selection names, as Build.tsx keys pages (pageKey): in the brain named, or the build's own. */
export function selectedKey(s: Selection): string | null {
  return s.page ? `${s.brain === "all" ? "grand-prix" : s.brain}:${s.page}` : null;
}

/** A page key (brain:slug) as a selection. */
export function selectionOf(key: string): Selection {
  const at = key.indexOf(":");
  const brain = key.slice(0, at);
  return { brain: isFocus(brain) ? brain : "grand-prix", page: key.slice(at + 1) || null };
}
