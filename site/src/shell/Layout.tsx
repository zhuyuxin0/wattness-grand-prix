import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { PRODUCT_NAME } from "../config";
import { isCapture } from "../lib/capture";
import { Loading } from "../ui/States";
import { Footer } from "./Footer";
import { Masthead } from "./Masthead";
import { Pager } from "./Pager";
import { SidePanel, TabDrawer } from "./SidePanel";
import { tabAt } from "./tabs";

/** The app: wattness.tech's masthead over a side panel of grouped tabs and the page. */
export function Layout() {
  const { pathname } = useLocation();
  const tab = tabAt(pathname);
  const [drawer, setDrawer] = useState(false);
  const menu = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    document.title = tab && tab.path !== "/" ? `${tab.label} · ${PRODUCT_NAME}` : PRODUCT_NAME;
  }, [tab]);

  // A new tab starts at its top; a change inside one (another battery) keeps the place.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [tab?.id]);

  useEffect(() => {
    setDrawer(false);
  }, [pathname]);

  useEffect(() => {
    if (isCapture()) document.documentElement.dataset.capture = "1";
  }, []);

  const close = useCallback(() => {
    setDrawer(false);
    menu.current?.focus();
  }, []);

  return (
    <div className="app">
      {/* A hash route owns the fragment, so the skip link moves focus itself. */}
      <a
        className="skip"
        href="#main"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("main")?.focus();
        }}
      >
        Skip to content
      </a>
      <Masthead tab={tab} menuOpen={drawer} onMenu={() => setDrawer((o) => !o)} menuRef={menu} />
      <div className="app__body">
        <SidePanel />
        <main id="main" className="app__main" tabIndex={-1}>
          <div className="app__page">
            <Suspense fallback={<Loading />}>
              <Outlet />
            </Suspense>
            <Pager />
          </div>
          <Footer />
        </main>
      </div>
      <TabDrawer open={drawer} onClose={close} />
    </div>
  );
}
