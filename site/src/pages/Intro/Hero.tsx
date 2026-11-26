import { useLayoutEffect, useRef, type ReactNode, type Ref } from "react";
import { Link } from "react-router-dom";
import bnbYellow from "../../assets/brand/bnb-chain-logo-yellow.svg";
import { SHOWCASE } from "../../config";
import { Glyph } from "../../ui";
import { Logo } from "../../ui/Logo";
import { StartHere } from "./StartHere";
import { HERO_STILL } from "./story";

// The landing's first view: chapter 01 of the introduction, Desert Willow at
// night, full bleed and dark in either theme, as the introduction itself is.
// It is a still, so the first paint loads no three.js; Play opens the
// introduction on the same picture. Over it, on the introduction's glass: the
// one hero line, the day's facts, Play, the way into the Terminal (the
// Overview's control room) and Verify; top right, the lockup that
// closes the introduction (chapter 23). Under the picture, on the same night
// ground, "Start where you are": the page that answers each kind of visitor.
// From 1024px the picture gives up the height that list takes, so the list is
// in the first view too. On a phone the still sits on top, the words follow it,
// and the list follows them.

/** The Wattness mark and word, a rule, BNB Chain's logo, and "Sealed on BNB Chain": the introduction's closing lockup. */
export function Lockup({ className }: { className?: string }) {
  return (
    <p className={`intro-lockup${className ? ` ${className}` : ""}`}>
      <span className="intro-lockup__row">
        <span className="intro-lockup__word">
          <Logo className="intro-lockup__mark" stroke={4} trace={false} />
          Wattness
        </span>
        <span className="intro-lockup__rule" aria-hidden="true" />
        <img className="intro-lockup__bnb" src={bnbYellow} alt="BNB Chain" width={319} height={56} />
      </span>
      <span className="intro-lockup__line">Sealed on BNB Chain</span>
    </p>
  );
}

interface HeroProps {
  /** The day's line under the hero line: how many plans, and how long before the gate they went on chain. */
  facts: ReactNode;
  /** Opens the introduction; without it (a build that cannot play it) "Enter the Terminal" takes the primary place. */
  onPlay?: () => void;
  /** Warms the introduction's code as the pointer or focus reaches Play. */
  onPlayIntent?: () => void;
  playRef?: Ref<HTMLButtonElement>;
  /** The still is in (or failed): the page may warm the introduction's code on an idle moment. */
  onStillLoad?: () => void;
}

export function Hero({ facts, onPlay, onPlayIntent, playRef, onStillLoad }: HeroProps) {
  const hero = useRef<HTMLElement>(null);
  const start = useRef<HTMLDivElement>(null);
  // The list's height, for the picture's: measured before the first paint and again whenever it changes.
  useLayoutEffect(() => {
    const host = hero.current;
    const list = start.current;
    if (!host || !list) return;
    const put = () => host.style.setProperty("--intro-start-h", `${list.offsetHeight}px`);
    put();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(put);
    ro.observe(list);
    return () => ro.disconnect();
  }, []);
  return (
    <section ref={hero} className="intro-hero" data-atmosphere="dark" aria-labelledby="intro-title">
      <div className="intro-hero__stage">
        <div className="intro-hero__frame">
          <img
            className="intro-hero__still"
            src={HERO_STILL.src}
            srcSet={HERO_STILL.srcSet}
            sizes="(max-width: 767px) 100vw, calc(100vw - 190px)"
            width={HERO_STILL.width}
            height={HERO_STILL.height}
            alt={HERO_STILL.alt}
            // React 18 knows no fetchPriority prop: the attribute as HTML spells it.
            {...{ fetchpriority: "high" }}
            decoding="async"
            onLoad={onStillLoad}
            onError={onStillLoad}
          />
        </div>
        <Lockup className="intro-hero__lockup" />
        <div className="intro-hero__card">
          <h1 id="intro-title" className="intro-hero__line">
            AI agents plan tomorrow for every Texas battery with complete public data and seal each plan on BNB&nbsp;Chain before the market closes.
          </h1>
          <p className="intro-hero__facts">{facts}</p>
          <div className="intro-hero__actions">
            {onPlay ? (
              <button
                ref={playRef}
                type="button"
                className="btn btn--primary intro-hero__play"
                aria-haspopup="dialog"
                onClick={onPlay}
                onPointerEnter={onPlayIntent}
                onFocus={onPlayIntent}
                onTouchStart={onPlayIntent}
              >
                Play the introduction
                <span className="intro-hero__len">3 min</span>
                <Glyph name="expand" />
              </button>
            ) : (
              <Link to="/overview" className="btn btn--primary intro-hero__play">
                Enter the Terminal
                <Glyph name="next" />
              </Link>
            )}
            {onPlay && (
              <Link to="/overview" className="btn intro-hero__enter">
                Enter the Terminal
                <Glyph name="next" />
              </Link>
            )}
            <Link to="/verify" className="intro-hero__link">
              Verify a plan
              <Glyph name="next" />
            </Link>
          </div>
        </div>
        <p className="intro-hero__scope">
          Chapter 01 of the introduction: {SHOWCASE.name} ({SHOWCASE.resource}) at night. Positions schematic.
        </p>
      </div>
      <div ref={start} className="intro-hero__start">
        <StartHere />
      </div>
    </section>
  );
}
