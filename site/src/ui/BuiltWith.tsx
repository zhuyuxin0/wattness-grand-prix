import { LogoChip, type ChipLogo } from "./LogoChip";
import "./built-with.css";

// "Built with" and the logo chips of the sponsors whose technology a section uses, as one row in the section's head.
// The chips are the logo registry's (packages/world/src/kit/logos, through LogoChip), each a link to its owner. A page
// loads the registry (src/pages/TechStack/sponsors.ts) and passes the entries; until they are in, the row is not drawn.

/** One chip: a registry entry, several in one glass (a product and the platform it runs on), or one with its words. */
export type BuiltWithEntry = ChipLogo | readonly ChipLogo[] | { logo: ChipLogo; caption: string };

const key = (e: BuiltWithEntry) => ("logo" in e ? e.logo.id : Array.isArray(e) ? e.map((l) => l.id).join("+") : (e as ChipLogo).id);

export function BuiltWith({ logos, label = "Built with", className }: { logos: readonly BuiltWithEntry[] | null | undefined; label?: string; className?: string }) {
  if (!logos?.length) return null;
  return (
    <div className={`built-with${className ? ` ${className}` : ""}`}>
      <span className="built-with__label">{label}</span>
      <span className="built-with__chips">
        {logos.map((e) =>
          "logo" in e ? (
            <LogoChip key={key(e)} logo={e.logo} caption={e.caption} size={13} />
          ) : (
            <LogoChip key={key(e)} logo={Array.isArray(e) ? [...e] : (e as ChipLogo)} size={13} />
          ),
        )}
      </span>
    </div>
  );
}
