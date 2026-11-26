// The logo chip: an owner's logo on white liquid glass, a link to the owner's page in a new tab. DOM, never painted
// into the 3D, so it faces the camera from any angle, stays crisp at any size and takes the pointer. The site's
// React chip (site/src/ui/LogoChip.tsx) renders the same markup and classes.
import './chip.css';
import { LOGOS, type LogoId, type LogoSpec } from './registry';

export interface ChipOptions {
  /** Words beside the logo; replaces the registry's caption ('' for none). Ignored for a group of logos. */
  caption?: string;
  /** The logo's height in px before its optical factor (default 20). */
  size?: number;
  /** A link to the owner's page in a new tab (default true). */
  link?: boolean;
  /** Another page than the registry's, for a one-logo chip. */
  href?: string;
  /** Extra classes on the chip. */
  className?: string;
}

const label = (name: string) => `${name} (opens in a new tab)`;

/** One logo: the image on its own ground, then its caption after a hairline. */
function part(spec: LogoSpec, caption: string | undefined, tag: 'a' | 'span', href: string | null, cls: string) {
  const el = document.createElement(tag);
  el.className = cls;
  el.dataset.logo = spec.id;
  if (tag === 'a' && href) {
    const a = el as HTMLAnchorElement;
    a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer';
    a.setAttribute('aria-label', label(caption && !spec.name.includes(caption) ? `${spec.name}, ${caption}` : spec.name));
    // a frame's own click handlers (the story steps on a click) never see a click on a link
    a.addEventListener('click', (e) => e.stopPropagation());
  } else {
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', spec.name);
  }
  const mark = document.createElement('span');
  mark.className = 'lg-mark';
  mark.dataset.ground = spec.ground;
  mark.style.setProperty('--lg-o', String(spec.optical));
  const img = document.createElement('img');
  img.src = spec.src; img.alt = ''; img.width = spec.w; img.height = spec.h;
  img.decoding = 'async'; img.draggable = false;
  mark.appendChild(img);
  el.appendChild(mark);
  if (caption) {
    const c = document.createElement('span');
    c.className = 'lg-cap';
    c.textContent = caption;
    el.appendChild(c);
  }
  return el;
}

/** A chip for one logo (the chip is the link) or several in one glass, a hairline between them (each its own link). */
export function logoChip(ids: LogoId | LogoId[], opts: ChipOptions = {}): HTMLElement {
  const list = Array.isArray(ids) ? ids : [ids];
  const link = opts.link ?? true;
  const extra = opts.className ? ` ${opts.className}` : '';
  let chip: HTMLElement;
  if (list.length === 1) {
    const spec = LOGOS[list[0]!];
    const caption = opts.caption ?? spec.caption;
    chip = part(spec, caption, link ? 'a' : 'span', link ? opts.href ?? spec.href : null, `lg-chip${extra}`);
  } else {
    chip = document.createElement('span');
    chip.className = `lg-chip is-group${extra}`;
    list.forEach((id, i) => {
      if (i) { const r = document.createElement('i'); r.className = 'lg-rule'; r.setAttribute('aria-hidden', 'true'); chip.appendChild(r); }
      const spec = LOGOS[id];
      chip.appendChild(part(spec, undefined, link ? 'a' : 'span', link ? spec.href : null, 'lg-part'));
    });
  }
  if (opts.size) chip.style.setProperty('--lg-h', `${opts.size}px`);
  return chip;
}

/** Resolves once every image in el has decoded, or after ms (a missing file never holds a frame up). */
export function chipsReady(el: ParentNode, ms = 1500): Promise<void> {
  const imgs = [...el.querySelectorAll<HTMLImageElement>('.lg-mark img')];
  const all = Promise.all(imgs.map((i) => (i.decode ? i.decode().catch(() => undefined) : undefined))).then(() => undefined);
  return Promise.race([all, new Promise<void>((ok) => setTimeout(ok, ms))]);
}

const warmed = new Map<string, Promise<void>>();
/** Fetches and decodes the files ahead (every logo by default), so a chip made later draws at once. */
export function preloadLogos(ids: LogoId[] = Object.keys(LOGOS) as LogoId[]): Promise<void> {
  return Promise.all(ids.map((id) => {
    const src = LOGOS[id].src;
    let p = warmed.get(src);
    if (!p) {
      const img = new Image(); img.decoding = 'async'; img.src = src;
      p = (img.decode ? img.decode() : Promise.resolve()).catch(() => undefined);
      warmed.set(src, p);
    }
    return p;
  })).then(() => undefined);
}
