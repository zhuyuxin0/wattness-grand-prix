import { NavLink } from "react-router-dom";
import { captureClock } from "../lib/capture";
import { Countdown } from "../ui/Countdown";
import { ThemeToggle } from "../ui/ThemeToggle";
import { Brand } from "./Brand";
import { NAV } from "./nav";

export function TopBar() {
  return (
    <header className="topbar">
      <div className="topbar__inner">
        <Brand />
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
        <div className="topbar__end">
          <Countdown size="sm" bare now={captureClock()} className="topbar__clock" />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
