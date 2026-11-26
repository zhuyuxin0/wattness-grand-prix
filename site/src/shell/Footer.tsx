import bnbBlack from "../assets/brand/bnb-chain-logo-black.svg";
import bnbYellow from "../assets/brand/bnb-chain-logo-yellow.svg";
import { CONTRACT_ADDRESS, REPO_URL, SHADOW_NOTE, SOURCE_LINE, TERMINAL_URL } from "../config";
import { Glyph } from "../ui/Glyph";
import { middle } from "../ui/Hash";
import { Logo } from "../ui/Logo";

const LINKS = [
  { href: REPO_URL, label: "Source code" },
  { href: `https://bscscan.com/address/${CONTRACT_ADDRESS}`, label: "GateRecord on BscScan" },
  { href: TERMINAL_URL, label: "Wattness Terminal" },
  { href: "https://wattness.ai", label: "wattness.ai" },
];

/** A quiet band on chrome: what the site is, its sources, where else to look, and the chain it seals on. */
export function Footer() {
  return (
    <footer className="footer">
      <div className="footer__inner">
        <div className="footer__about">
          <div className="footer__brand">
            <Logo className="footer__mark" trace={false} />
            <span className="footer__word">Wattness</span>
            <span className="brand-product">Grand Prix</span>
          </div>
          <p>Tomorrow's plan for every Texas battery with complete public data (316 on Nov&nbsp;26), sealed on BNB Chain before the 10:00&nbsp;CT day-ahead gate.</p>
        </div>
        <div className="footer__lines">
          <p className="footer__source">{SOURCE_LINE}</p>
          <p>
            Commits: GateRecord (<span className="mono">{middle(CONTRACT_ADDRESS, 4, 4)}</span>) on BNB Smart Chain, read from each chain's receipt.
          </p>
          <p>{SHADOW_NOTE}</p>
        </div>
        <ul className="footer__links">
          {LINKS.map((l) => (
            <li key={l.href}>
              <a href={l.href} target="_blank" rel="noreferrer">
                {l.label}
                <Glyph name="popout" />
              </a>
            </li>
          ))}
        </ul>
        {/* BNB Chain's logo whole, from its official files: yellow on dark, black on light, with its clear space. */}
        <div className="footer__sealed">
          <span>Sealed on</span>
          <span className="footer__bnb">
            <img className="bnb-logo bnb-logo--black" src={bnbBlack} alt="BNB Chain" width={114} height={20} />
            <img className="bnb-logo bnb-logo--yellow" src={bnbYellow} alt="BNB Chain" width={114} height={20} />
          </span>
        </div>
      </div>
    </footer>
  );
}
