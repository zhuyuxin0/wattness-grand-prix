// "Enter the Terminal": the way from the introduction into the Overview's control room. The landing's second button
// opens it (Play first, Verify a plan kept as a link), the introduction's last stop offers it, and the Intro's closing
// band names the Overview the same way. Read from the sources, as the pages render them.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const intro = join(resolve(dirname(fileURLToPath(import.meta.url)), ".."), "src", "pages", "Intro");
const read = (name) => readFileSync(join(intro, name), "utf8");

/** The JSX of the hero's actions, from its opening tag to its closing one. */
function heroActions() {
  const src = read("Hero.tsx");
  const from = src.indexOf('<div className="intro-hero__actions">');
  const to = src.indexOf("</div>", from);
  assert.ok(from > 0 && to > from, "Hero.tsx has its actions");
  return src.slice(from, to);
}

test("the landing: Play, then Enter the Terminal (the Overview), then Verify a plan as a link", () => {
  const acts = heroActions();
  const play = acts.indexOf("Play the introduction");
  const enter = acts.indexOf("Enter the Terminal", play);
  const verify = acts.indexOf("Verify a plan");
  assert.ok(play > 0 && enter > play && verify > enter, "in that order");
  // the button after Play: a Link to /overview drawn as a button
  assert.match(acts.slice(play, verify), /<Link to="\/overview" className="btn intro-hero__enter">\s*Enter the Terminal/);
  // Verify a plan: a plain link now, not a button
  assert.match(acts, /<Link to="\/verify" className="intro-hero__link">\s*Verify a plan/);
  assert.doesNotMatch(acts, /Open the Overview/);
  // a build that cannot play the introduction leads with the same way in
  assert.match(acts, /<Link to="\/overview" className="btn btn--primary intro-hero__play">\s*Enter the Terminal/);
});

test("the introduction's last stop offers Enter the Terminal, and only the last", () => {
  const src = read("StoryOverlay.tsx");
  assert.match(src, /story\.on\("beat", \(b\) => \{\s*if \(!gone\) setAtEnd\(\(b as \{ index\?: number \} \| undefined\)\?\.index === story\.beats\.length - 1\);/);
  const at = src.indexOf("{atEnd && shown && !failed && (");
  assert.ok(at > 0, "the offer shows at the end, once the story is drawn");
  const offer = src.slice(at, src.indexOf("</div>", at));
  assert.match(offer, /onClick=\{\(\) => live\.current\.onRoute\("\/overview"\)\}/);
  assert.match(offer, /Enter the Terminal/);
  // the failed state's way on says the same
  assert.doesNotMatch(src, /Open the Overview/);
});

test("the Intro's closing band names the Overview as the Terminal", () => {
  const src = read("Closing.tsx");
  assert.match(src, /<Link to="\/overview" className="intro-close__link">\s*Enter the Terminal/);
  assert.doesNotMatch(src, /Open the Overview/);
});
