import { Suspense, useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { PRODUCT_NAME } from "../config";
import { isCapture } from "../lib/capture";
import { Loading } from "../ui/States";
import { Footer } from "./Footer";
import { NAV } from "./nav";
import { TopBar } from "./TopBar";

export function Layout() {
  const { pathname } = useLocation();

  useEffect(() => {
    const item = NAV.find((n) => n.path === pathname);
    document.title = item && item.path !== "/" ? `${item.label} · ${PRODUCT_NAME}` : PRODUCT_NAME;
    window.scrollTo(0, 0);
  }, [pathname]);

  useEffect(() => {
    if (isCapture()) document.documentElement.dataset.capture = "1";
  }, []);

  return (
    <div className="app">
      <a className="skip" href="#main">
        Skip to content
      </a>
      <TopBar />
      <main id="main" className="main">
        <Suspense fallback={<Loading />}>
          <Outlet />
        </Suspense>
      </main>
      <Footer />
    </div>
  );
}
