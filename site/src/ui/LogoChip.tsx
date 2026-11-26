// An owner's logo on white liquid glass, a link to the owner's page in a new tab. The files, their sources and the
// chip's stylesheet are the world package's logo registry (packages/world/src/kit/logos), and this renders the same
// markup and classes as its logoChip, so a chip looks the same on a page and in the 3D.
//
// The site loads the world package only by dynamic import from a page (test/world-tabs.test.mjs), so a page that
// shows logos imports @world/kit/logos that way (which also brings the chip's stylesheet) and passes its entries
// here, as in <LogoChip logo={[LOGOS.atlas, LOGOS.cmc]} />. A logo the registry does not hold (the Prices board's
// companies, whose files are public/logos') passes the same fields with its own id.
import { Fragment, type CSSProperties } from "react";
import type { LogoSpec } from "@world/kit/logos";

type Vars = CSSProperties & Record<`--${string}`, string>;

/** A logo for the chip: a registry entry, or another owner's file with the same fields. */
export type ChipLogo = Omit<LogoSpec, "id"> & { id: string };

/** One logo: the image on its own ground, then its caption after a hairline; a link unless link is false. */
function Part({ spec, caption, link, href, className, style }: { spec: ChipLogo; caption?: string; link: boolean; href: string; className: string; style?: Vars }) {
  const body = (
    <>
      <span className="lg-mark" data-ground={spec.ground} style={{ "--lg-o": String(spec.optical) } as Vars}>
        <img src={spec.src} alt="" width={spec.w} height={spec.h} decoding="async" draggable={false} />
      </span>
      {caption ? <span className="lg-cap">{caption}</span> : null}
    </>
  );
  if (!link) {
    return (
      <span className={className} style={style} data-logo={spec.id} role="img" aria-label={spec.name}>
        {body}
      </span>
    );
  }
  const name = caption && !spec.name.includes(caption) ? `${spec.name}, ${caption}` : spec.name;
  return (
    <a
      className={className}
      style={style}
      data-logo={spec.id}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${name} (opens in a new tab)`}
      onClick={(e) => e.stopPropagation()}
    >
      {body}
    </a>
  );
}

/** One logo (the chip is the link), or several in one glass with a hairline between them, each its own link. */
export function LogoChip({
  logo,
  caption,
  size,
  link = true,
  href,
  className,
}: {
  /** The registry's entries (LOGOS.<id>), or another owner's logo with the same fields. */
  logo: ChipLogo | ChipLogo[];
  /** Words beside the logo; replaces the registry's caption ("" for none). Ignored for a group. */
  caption?: string;
  /** The logo's height in px before its optical factor (default 20). */
  size?: number;
  link?: boolean;
  /** Another page than the registry's, for a one-logo chip. */
  href?: string;
  className?: string;
}) {
  const list = Array.isArray(logo) ? logo : [logo];
  const style = size ? ({ "--lg-h": `${size}px` } as Vars) : undefined;
  const extra = className ? ` ${className}` : "";
  const first = list[0];
  if (list.length === 1 && first) {
    return <Part spec={first} caption={caption ?? first.caption} link={link} href={href ?? first.href} className={`lg-chip${extra}`} style={style} />;
  }
  return (
    <span className={`lg-chip is-group${extra}`} style={style}>
      {list.map((spec, i) => (
        <Fragment key={spec.id}>
          {i > 0 ? <i className="lg-rule" aria-hidden="true" /> : null}
          <Part spec={spec} link={link} href={spec.href} className="lg-part" />
        </Fragment>
      ))}
    </span>
  );
}
