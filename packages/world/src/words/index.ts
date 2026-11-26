// Plain words first, for every station that wants them (Jo's decisions of Nov 26: labels lead with the plain meaning,
// the racing term second, small, as flavor). Wraps the kit's caption (lib/plates.ts and kit/css/plates.css, both
// unchanged): the flavor line is set inside the caption's glass, under its head. litType sizes a frame's plates, ticks,
// key and scope one step up (words.css).
import './words.css';
import type { FrameContext } from '../stations/types';

export interface Words {
  /** What happens, in plain words. */
  head: string;
  /** The Grand Prix's word for it, shown small under the head. */
  flavor?: string;
  line?: string;
}

/** The caption on glass, lower left: the plain head, the flavor under it, then the line. Returns the caption's rect in
 *  stage px (null when removed). */
export function caption(ctx: FrameContext, w: Words | null) {
  const r = ctx.plates.caption(w ? { head: w.head, line: w.line } : null);
  if (!w || !w.flavor) return r;
  const cap = ctx.plates.root.querySelector<HTMLElement>('.hwalk-cap');
  const h = cap?.querySelector('h3');
  if (!cap || !h) return r;
  const f = document.createElement('div');
  f.className = 'w-flavor';
  f.textContent = w.flavor;
  h.after(f);
  // in the story's films the film's line stands in for this caption, which stays in the layout hidden: the plates keep
  // off the line (r, null where the row has none), not off the hidden glass
  if (cap.style.visibility === 'hidden') return r;
  const a = cap.getBoundingClientRect(), b = ctx.plates.root.getBoundingClientRect();
  return { x: a.left - b.left, y: a.top - b.top, w: a.width, h: a.height };
}

/** The lit frames' type: plates 20 px, ticks and the key 18, the scope 16 (at 1920). Call before laying out plates. */
export function litType(ctx: FrameContext) {
  ctx.plates.root.parentElement?.classList.add('w-lit');
}
