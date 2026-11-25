import { CONTRACT_ADDRESS, PRODUCT_NAME, REPO_URL, SHADOW_NOTE, SOURCE_LINE, TERMINAL_URL } from "../config";
import { Mark } from "../ui/Livery";

export function Footer() {
  return (
    <footer className="footer">
      <div className="footer__inner">
        <div className="footer__brand">
          <Mark size={18} />
          <span>{PRODUCT_NAME}</span>
        </div>
        <div className="footer__lines">
          <p className="footer__source">{SOURCE_LINE}</p>
          <p className="muted">{SHADOW_NOTE}</p>
          <p className="muted">
            Hedge figures use ElectronX's published hourly bounded-future terms at an assumed fair-value entry: a scenario comparison, not a trade.
          </p>
        </div>
        <ul className="footer__links">
          <li>
            <a href={REPO_URL} target="_blank" rel="noreferrer">
              Source code
            </a>
          </li>
          <li>
            <a href={`https://bscscan.com/address/${CONTRACT_ADDRESS}`} target="_blank" rel="noreferrer">
              GateRecord on BscScan
            </a>
          </li>
          <li>
            <a href={TERMINAL_URL} target="_blank" rel="noreferrer">
              Wattness Terminal
            </a>
          </li>
        </ul>
      </div>
    </footer>
  );
}
