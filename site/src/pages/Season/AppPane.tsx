import { useEffect, useRef, useState } from "react";
import type { LogoSpec } from "@world/kit/logos";
import { Glyph, Hash } from "../../ui";
import { LogoChip } from "../../ui/LogoChip";
import { APP_HEIGHT_MESSAGE, APP_PATH, APP_RELEASE, APP_TEMPLATE_COMMIT, APP_ZIP_SHA256, FLAP_APP_URL } from "./app-build";
import { CheckIt } from "./CheckIt";

// The Season tab's first view: the Wattness Season Mini App itself, the release built for Flap's
// host, framed here in guest mode on BSC testnet. The frame follows the App's own height (its
// message, from this origin and this frame only), so the page scrolls once.

/** Flap's chip from the logo registry, loaded as the site loads the world package (ui/LogoChip.tsx). */
function useFlapLogo(): LogoSpec | null {
  const [logo, setLogo] = useState<LogoSpec | null>(null);
  useEffect(() => {
    let live = true;
    import("@world/kit/logos").then(
      (m) => live && setLogo(m.LOGOS.flap),
      (error: unknown) => console.warn("The logos could not be loaded:", error),
    );
    return () => {
      live = false;
    };
  }, []);
  return logo;
}

export function AppPane() {
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState<number | null>(null);
  const flap = useFlapLogo();

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || !frame.current || e.source !== frame.current.contentWindow) return;
      const data = e.data as { type?: unknown; height?: unknown } | null;
      if (!data || data.type !== APP_HEIGHT_MESSAGE || typeof data.height !== "number") return;
      if (data.height > 240 && data.height < 24_000) setHeight(Math.ceil(data.height));
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return (
    <>
      <div className="season-app">
        <div className="season-app__bar">
          {flap ? <LogoChip logo={flap} caption="" size={15} /> : null}
          <span className="season-app__title">
            Wattness Season <span className="season-app__release">Mini App, release {APP_RELEASE}</span>
          </span>
          <span className="season-app__mode">BSC testnet · guest, read only</span>
          <a className="season-app__open" href={FLAP_APP_URL} target="_blank" rel="noopener noreferrer">
            Open on Flap
            <Glyph name="external" />
          </a>
        </div>
        <iframe
          ref={frame}
          className="season-app__frame"
          src={`${APP_PATH}?lang=en`}
          title="Wattness Season, the Mini App on Flap, in guest mode on BSC testnet"
          style={height ? { height } : undefined}
          referrerPolicy="no-referrer"
        />
      </div>
      <p className="season-app__note">
        The same App Flap's host runs, built from Flap's vault component template: here it reads BSC testnet in your browser and holds no wallet. To back the agent, contribute,
        launch, claim or refund, open it on Flap and connect a wallet on BSC testnet.
      </p>
      <CheckIt what="the release and this build">
        <ul className="season-check__list">
          <li>
            <span className="season-check__what">Release {APP_RELEASE}'s ZIP for Flap, SHA-256</span>
            <Hash value={APP_ZIP_SHA256} head={8} tail={8} label="ZIP SHA-256" />
          </li>
          <li>
            <span className="season-check__what">Flap's template, commit</span>
            <a href={`https://github.com/flap-sh/flap-vault-component-template/commit/${APP_TEMPLATE_COMMIT}`} target="_blank" rel="noreferrer">
              <Hash value={APP_TEMPLATE_COMMIT} head={7} tail={4} copy={false} label="template commit" />
            </a>
          </li>
          <li>
            <span className="season-check__what">This build's files and sources</span>
            <a href={`${APP_PATH}receipt.json`} target="_blank" rel="noreferrer">
              receipt.json
            </a>
            <span className="muted">each served file's SHA-256, the App's four source files', and the guest host's</span>
          </li>
        </ul>
      </CheckIt>
    </>
  );
}
