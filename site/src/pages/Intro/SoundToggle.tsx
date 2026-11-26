import { useEffect, useRef, useState } from "react";
import { Glyph } from "../../ui";
import "./sound.css";

// The visitor's Sound switch, in the introduction's bar and on ONE PLAN: off
// until they turn it on, then remembered in this browser. The cues are made in
// the page by packages/world's lib/sound (Web Audio, no file to fetch). Its
// module is loaded as the switch mounts, so a click finds it in hand and the
// audio starts inside that click, as browsers ask, and never before one.

/** lib/sound's SOUND_KEY (test/sound.test.mjs holds the two equal), read here so the switch shows the choice before the module has loaded. */
const KEY = "gp.sound";

type SoundModule = typeof import("@world/lib/sound");

function storedOn(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "on";
  } catch {
    return false;
  }
}

export function SoundToggle({ className = "" }: { className?: string }) {
  const [on, setOn] = useState(storedOn);
  const kit = useRef<SoundModule | null>(null);
  // a click before the module was in hand: its choice, made as the module arrives
  const pending = useRef<boolean | null>(null);

  useEffect(() => {
    let gone = false;
    let off: (() => void) | null = null;
    import("@world/lib/sound").then(
      (m) => {
        if (gone) return;
        kit.current = m;
        if (pending.current !== null) m.setSound(pending.current);
        pending.current = null;
        setOn(m.soundOn());
        off = m.onSoundChange(() => setOn(m.soundOn()));
      },
      () => {
        // No module (a chunk that did not load): the switch keeps the stored choice, and nothing sounds.
      },
    );
    return () => {
      gone = true;
      off?.();
    };
  }, []);

  const flip = () => {
    const m = kit.current;
    if (m) {
      m.setSound(!m.soundOn());
      return;
    }
    const next = !on;
    pending.current = next;
    try {
      window.localStorage.setItem(KEY, next ? "on" : "off");
    } catch {
      // Storage blocked: the choice holds while the page is open.
    }
    setOn(next);
  };

  return (
    <button
      type="button"
      className={`btn sound-toggle${className ? ` ${className}` : ""}`}
      data-sound-switch=""
      aria-pressed={on}
      title={on ? "Sound is on: turn it off" : "Turn the sound on"}
      onClick={flip}
    >
      <Glyph name={on ? "sound" : "sound-off"} size={12} />
      <span className="sound-toggle__label">Sound</span>
    </button>
  );
}
