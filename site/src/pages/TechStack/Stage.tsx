import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { StackHandle } from "@world/stations/stack/mount";
import { isCapture } from "../../lib/capture";
import { worldPath } from "../../shell/world";

// The stack in 3D: mountStack (packages/world/src/stations/stack) fills the
// stage and follows its size. A piece's click, a second tap or its card's
// button opens the tab that shows it, through the site's map of the package's
// tab ids (shell/world.ts). The 3D holds its own dark in either page theme.
//
// The scene's own key card is drawn at the 1,920 px cut's size; in the site's
// narrower column it would sit over the pieces at the bottom right. So the
// mount runs without it (its fit then takes the width the key kept free) and
// the same key, the package's own card and rows, is drawn in the stage's bar.

export function StackStage() {
  const el = useRef<HTMLDivElement>(null);
  const legend = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const go = useRef(navigate);
  go.current = navigate;
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let gone = false;
    let handle: StackHandle | null = null;
    const fail = (error: unknown) => {
      if (gone) return;
      console.warn("The stack could not start:", error);
      setFailed(true);
    };
    const drawKey = async () => {
      const [{ keyCard }, { keyRows }, { PAL }] = await Promise.all([
        import("@world/stations/stack/dom"),
        import("@world/stations/stack/common"),
        import("@world/stations/stack/space"),
      ]);
      if (gone || !legend.current) return;
      legend.current.replaceChildren();
      keyCard(legend.current, { title: "The stack", rows: keyRows(PAL.dark) }, "dark");
    };
    import("@world/stations/stack/mount").then(({ mountStack }) => {
      if (gone || !el.current) return;
      handle = mountStack(el.current, {
        theme: "dark",
        key: false,
        onRoute: (id) => {
          const to = worldPath(id);
          if (to) go.current(to);
        },
        // A recording holds the moving marks still; otherwise the visitor's reduced-motion setting decides.
        still: isCapture() ? true : undefined,
      });
      handle.ready.then(
        () => drawKey().catch((error: unknown) => console.warn("The stack's key could not be drawn:", error)),
        fail,
      );
    }, fail);
    return () => {
      gone = true;
      handle?.dispose();
    };
  }, []);

  // Without the 3D the list under it carries every piece, so the stage steps aside.
  if (failed) return null;
  return (
    <section className="stack-stage" data-atmosphere="dark" aria-label="The stack, in 3D">
      <div ref={el} className="stack-stage__space" />
      <div className="stack-stage__bar">
        <div ref={legend} className="stack-legend" />
        <p className="stack-stage__hint">
          Point at a piece for its role and its records; click it to open its tab. On a touch screen, tap once for the card and again to open.
        </p>
      </div>
    </section>
  );
}
