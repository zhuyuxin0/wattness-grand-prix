import type { ReactNode, Ref } from "react";
import { Link } from "react-router-dom";
import bnbYellow from "../../assets/brand/bnb-chain-logo-yellow.svg";
import { SHOWCASE } from "../../config";
import { Glyph } from "../../ui";
import { Logo } from "../../ui/Logo";
import { HERO_STILL } from "./story";

// The landing's first view: chapter 01 of the introduction, Desert Willow at
// night, full bleed and dark in either theme, as the introduction itself is.
// It is a still, so the first paint loads no three.js; Play opens the
// introduction on the same picture. Over it, on the introduction's glass: the
// one hero line, the day's facts, Play and Verify; top right, the lockup that
// closes the introduction (chapter 23). On a phone the still sits on top and
// the words follow it.

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
  /** Opens the introduction; without it (a build that cannot play it) the Overview takes the primary place. */
  onPlay?: () => void;
  /** Warms the introduction's code as the pointer or focus reaches Play. */
  onPlayIntent?: () => void;
  playRef?: Ref<HTMLButtonElement>;
  /** The still is in (or failed): the page may warm the introduction's code on an idle moment. */
  onStillLoad?: () => void;
}

export function Hero({ facts, onPlay, onPlayIntent, playRef, onStillLoad }: HeroProps) {
  return (
    <section className="intro-hero" data-atmosphere="dark" aria-labelledby="intro-title">
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
              Open the Overview
              <Glyph name="next" />
            </Link>
          )}
          <Link to="/verify" className="btn intro-hero__verify">
            Verify a plan
          </Link>
          {onPlay && (
            <Link to="/overview" className="intro-hero__link">
              Open the Overview
              <Glyph name="next" />
            </Link>
          )}
        </div>
      </div>
      <p className="intro-hero__scope">
        Chapter 01 of the introduction, which tells the Nov 26 record: {SHOWCASE.name} ({SHOWCASE.resource}) at night. Positions schematic.
      </p>
    </section>
  );
}
