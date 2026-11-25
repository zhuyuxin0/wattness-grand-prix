import { NavLink } from "react-router-dom";
import { PRODUCT_NAME } from "../config";
import { captureClock } from "../lib/capture";
import { Countdown } from "../ui/Countdown";
import { LiveryStripe, Mark } from "../ui/Livery";
import { NAV } from "./nav";

export function TopBar() {
  return (
    <header className="topbar">
      <div className="topbar__inner">
        <NavLink to="/" className="brand" aria-label={PRODUCT_NAME}>
          <Mark />
          <span className="brand__name">
            <span className="brand__wattness">Wattness</span>
            <span className="brand__gp">Grand Prix</span>
          </span>
        </NavLink>
        <nav className="nav" aria-label="Primary">
          <ul>
            {NAV.map((item) => (
              <li key={item.path}>
                <NavLink to={item.path} end={item.path === "/"} title={item.gloss} className={({ isActive }) => `nav__link${isActive ? " is-active" : ""}`}>
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <Countdown size="sm" bare now={captureClock()} className="topbar__clock" />
      </div>
      <LiveryStripe />
    </header>
  );
}
