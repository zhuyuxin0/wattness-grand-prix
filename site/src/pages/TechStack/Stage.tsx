import { useCallback, useRef, useState } from "react";
import { StackSpace } from "./StackSpace";

// The stack in 3D: the site's one mount of it (StackSpace.tsx) fills the stage
// and follows its size. A piece's click, a second tap or its card's button
// opens the tab that shows it. The 3D holds its own dark in either page theme.
//
// The scene's own key card is drawn at the 1,920 px cut's size; in the site's
// narrower column it would sit over the pieces at the bottom right. So the
// mount runs without it (its fit then takes the width the key kept free) and
// the same key, the package's own card and rows, is drawn in the stage's bar.

export function StackStage() {
  const legend = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  const drawKey = useCallback(() => {
    Promise.all([import("@world/stations/stack/dom"), import("@world/stations/stack/common"), import("@world/stations/stack/space")])
      .then(([{ keyCard }, { keyRows }, { PAL }]) => {
        if (!legend.current) return;
        legend.current.replaceChildren();
        keyCard(legend.current, { title: "The stack", rows: keyRows(PAL.dark) }, "dark");
      })
      .catch((error: unknown) => console.warn("The stack's key could not be drawn:", error));
  }, []);
  const fail = useCallback(() => setFailed(true), []);

  // Without the 3D the list under it carries every piece, so the stage steps aside.
  if (failed) return null;
  return (
    <section className="stack-stage" data-atmosphere="dark" aria-label="The stack, in 3D">
      <StackSpace className="stack-stage__space" onReady={drawKey} onFail={fail} />
      <div className="stack-stage__bar">
        <div ref={legend} className="stack-legend" />
        <p className="stack-stage__hint">
          Point at a piece for its role and its records; click it to open its tab. On a touch screen, tap once for the card and again to open.
        </p>
      </div>
    </section>
  );
}
