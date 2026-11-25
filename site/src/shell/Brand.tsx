import { Link } from "react-router-dom";
import { PRODUCT_SHORT } from "../config";
import { Logo } from "../ui/Logo";

/**
 * The lockup is the mark and "Wattness", nothing else inside it; the product
 * name sits beside it as a label, the way wattness.tech sets "Market Terminal".
 */
export function Brand() {
  return (
    <span className="brand-group">
      <Link to="/" className="brand" aria-label={`Wattness ${PRODUCT_SHORT}: the intro`} title="The intro">
        <Logo className="brand-mark" />
        <span className="brand-word">Wattness</span>
      </Link>
      <span className="brand-product">{PRODUCT_SHORT}</span>
    </span>
  );
}
